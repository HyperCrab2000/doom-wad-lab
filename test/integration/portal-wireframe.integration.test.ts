import { describe, expect, it } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import {
  measureVisibleGameCanvas,
  VISIBLE_PROBE_SCRIPT,
} from '../browser/puppeteerVisibleProbe';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const STORAGE_KEY = 'doom-render-layers-v5';

const PORTAL_WIREFRAME_TOGGLES = {
  wireframeMode: 'sight',
  meshTriangles: false,
  courtyardSky: true,
  solidWalls: false,
  solidCeilings: false,
  solidFloors: false,
  floorTextures: false,
  ceilingTextures: false,
  wallTextures: false,
  animatedLiquid: false,
  sky: false,
  dynamicLighting: false,
  coloredLighting: false,
  voxels: false,
};

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForPlaying(page: Page): Promise<void> {
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
}

describe('portal culled wireframe integration', () => {
  it(
    'Classic WebGL 1+1b shows wireframe pixels at E1M1 spawn (not a black screen)',
    async () => {
      expect(await isServerUp(), `Start dev server at ${BASE_URL}`).toBe(true);

      let browser: Browser | null = null;
      let page: Page | null = null;

      try {
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
        });
        page = await browser.newPage();
        await page.evaluateOnNewDocument(VISIBLE_PROBE_SCRIPT);
        await page.setViewport({ width: 1280, height: 900 });

        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        const wadSelect = await page.$('.level-toolbar select');
        if (wadSelect) {
          await wadSelect.select('/wads/DOOM.WAD');
        }
        await waitForPlaying(page);

        await page.evaluate(
          (key, toggles) => {
            sessionStorage.setItem(key, JSON.stringify(toggles));
          },
          STORAGE_KEY,
          PORTAL_WIREFRAME_TOGGLES
        );
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForPlaying(page);

        let measure = await measureVisibleGameCanvas(page, 10);
        for (let i = 0; i < 20 && measure.glBlackRatio > 0.92; i++) {
          await new Promise((r) => setTimeout(r, 250));
          measure = await measureVisibleGameCanvas(page, 10);
        }

        const stats = await page.evaluate(() => {
          const w = window as unknown as {
            __doomDrawStats?: { wallEntries?: number; wireframePortalCulled?: boolean };
          };
          return w.__doomDrawStats ?? null;
        });

        expect(stats?.wireframePortalCulled).toBe(true);
        expect((stats?.wallEntries ?? 0)).toBeGreaterThan(10);
        expect(
          measure.glBlackRatio,
          `portal wireframe WebGL framebuffer mostly black (ratio=${measure.glBlackRatio.toFixed(3)})`
        ).toBeLessThan(0.92);
        expect(
          measure.imgBlackRatio,
          `portal wireframe visible image mostly black (ratio=${measure.imgBlackRatio.toFixed(3)})`
        ).toBeLessThan(0.92);
      } finally {
        await page?.close().catch(() => {});
        await browser?.close().catch(() => {});
      }
    },
    180_000
  );
});
