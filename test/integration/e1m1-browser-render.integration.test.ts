import { describe, expect, it } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import {
  measureVisibleGameCanvas,
  VISIBLE_PROBE_SCRIPT,
} from '../browser/puppeteerVisibleProbe';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const MAX_BLACK_RATIO = 0.45;
const GRID = 10;

type Measure = Awaited<ReturnType<typeof measureVisibleGameCanvas>>;

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe('E1M1 browser render integration', () => {
  it(
    'auto-loads E1M1 and the renderer must not be mostly black after ready',
    async () => {
      if (!(await isServerUp())) {
        if (process.env.BROWSER_INTEGRATION_REQUIRED === '1') {
          expect(await isServerUp(), `Start dev server at ${BASE_URL}`).toBe(true);
        }
        return;
      }

      let browser: Browser | null = null;
      let page: Page | null = null;
      const consoleErrors: string[] = [];

      try {
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
        });
        page = await browser.newPage();
        await page.evaluateOnNewDocument(VISIBLE_PROBE_SCRIPT);
        await page.setViewport({ width: 1280, height: 900 });
        page.on('console', (m) => {
          if (m.type() === 'error') consoleErrors.push(m.text());
        });
        page.on('pageerror', (e) => consoleErrors.push(e.message));

        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        const wadSelect = await page.$('.level-toolbar select');
        if (wadSelect) {
          await wadSelect.select('/wads/DOOM.WAD');
        }
        await page.waitForFunction(
          () => {
            const viewer = document.querySelector('.level-viewer');
            return (
              viewer?.getAttribute('data-map-load-state') === 'ready' &&
              viewer?.getAttribute('data-is-playing') === 'true'
            );
          },
          { timeout: 120_000 }
        );

        const timeline: Measure[] = [];
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 250));
          timeline.push(await measureVisibleGameCanvas(page, GRID));
        }

        const final = timeline[timeline.length - 1]!;
        const mostlyBlackWhilePlaying = timeline.filter(
          (m) => m.isPlaying && m.mapLoadState === 'ready' && m.blackRatio > MAX_BLACK_RATIO
        );

        expect(consoleErrors).toEqual([]);
        expect(final.toolbarVisible, 'toolbar hidden while playing').toBe(true);
        expect(final.fpsLive).toBe(true);
        expect(final.hudVisible).toBe(true);
        expect(final.rendererError).toBeNull();
        expect(final.hasWebgl).toBe(true);
        expect(final.glBlackRatio).toBeLessThanOrEqual(MAX_BLACK_RATIO);
        expect(
          final.imgBlackRatio,
          'visible game image was black while WebGL had content'
        ).toBeLessThanOrEqual(MAX_BLACK_RATIO);
        expect((final.rect?.h ?? 0)).toBeGreaterThan(64);
        expect(
          final.blackRatio,
          `visible canvas mostly black (ratio=${final.blackRatio.toFixed(2)})`
        ).toBeLessThanOrEqual(MAX_BLACK_RATIO);
        expect(mostlyBlackWhilePlaying.length).toBeLessThanOrEqual(4);
      } finally {
        await page?.close().catch(() => {});
        await browser?.close().catch(() => {});
      }
    },
    180_000
  );
});
