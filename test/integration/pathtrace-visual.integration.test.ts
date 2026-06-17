import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT_DIR = path.resolve('tmp-e1m1-verify');

function parseHud(hud: string) {
  const triMatch = hud.match(/(\d+)\s+tris/);
  const viewMatch = hud.match(/view\s+(\d+)×(\d+)/);
  return {
    tris: triMatch ? Number(triMatch[1]) : 0,
    viewW: viewMatch ? Number(viewMatch[1]) : 0,
    viewH: viewMatch ? Number(viewMatch[2]) : 0,
  };
}

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe('path trace visual integration', () => {
  const runVisual = process.env.RUN_PATH_TRACE_VISUAL === '1';

  it.skipIf(!runVisual)(
    'E1M1 path trace shows corridor geometry spread (not a horizontal band)',
    async () => {
      expect(await isServerUp(), `Start dev server at ${BASE_URL}`).toBe(true);
      fs.mkdirSync(OUT_DIR, { recursive: true });

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
        await page.setViewport({ width: 1280, height: 900 });
        page.on('console', (m) => {
          if (m.type() === 'error') consoleErrors.push(m.text());
        });
        page.on('pageerror', (e) => consoleErrors.push(e.message));

        await page.goto(`${BASE_URL}/?renderer=pathtrace`, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        const wadSelect = await page.$('.level-toolbar select');
        if (wadSelect) await wadSelect.select('/wads/DOOM.WAD');

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

        let hud = '';
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          hud =
            (await page.$eval('.path-trace-hud', (el) => el.textContent).catch(() => '')) ?? '';
          const stats = parseHud(hud);
          if (stats.tris >= 100 && stats.viewW >= 100) break;
        }

        await new Promise((r) => setTimeout(r, 4000));
        const shotPath = path.join(OUT_DIR, 'pathtrace-vitest.png');
        await page.screenshot({ path: shotPath, fullPage: false });

        const hudStats = parseHud(hud);
        if (hudStats.tris < 100) {
          throw new Error(
            `Path trace never reported geometry. HUD="${hud}" consoleErrors=${JSON.stringify(consoleErrors.slice(0, 5))}`
          );
        }

        const analysis = await page.evaluate(() => {
          const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
          if (!canvas) return { error: 'no canvas' };
          const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
          if (!gl) return { error: 'no gl' };

          const w = canvas.width;
          const h = canvas.height;
          const scale = Math.floor(w / 320);
          const pfW = 320 * scale;
          const pfH = 168 * scale;
          const pfX = Math.round((w - pfW) / 2);
          const pfY = Math.max(0, Math.round((h - 200 * scale) / 2));

          const rowStats = [];
          for (let row = 0; row < 8; row++) {
            const y = pfY + Math.floor(((row + 0.5) / 8) * pfH);
            let nonSky = 0;
            for (let col = 0; col < 16; col++) {
              const x = pfX + Math.floor(((col + 0.5) / 16) * pfW);
              const buf = new Uint8Array(4);
              gl.readPixels(x, h - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
              if (!(buf[0] === 115 && buf[1] === 158 && buf[2] === 224)) nonSky++;
            }
            rowStats.push({ row, nonSky });
          }

          let marginMagenta = 0;
          for (let i = 0; i < 20; i++) {
            const x = Math.floor((i / 19) * w);
            const buf = new Uint8Array(4);
            gl.readPixels(x, Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            if (buf[0] > 200 && buf[1] < 50 && buf[2] > 200) marginMagenta++;
          }

          return { rowStats, marginMagenta };
        });

        const rowsWithWalls = (analysis.rowStats ?? []).filter((r) => r.nonSky >= 4).length;
        const maxRowWalls = (analysis.rowStats ?? []).reduce((m, r) => Math.max(m, r.nonSky), 0);
        const bandPattern = rowsWithWalls <= 2 && maxRowWalls >= 8;

        expect(/GPU ray cast/i.test(hud), `HUD: ${hud}`).toBe(true);
        expect(/GPU failed/i.test(hud), `shader failed: ${hud}`).toBe(false);
        expect(hudStats.tris, `triangle count in HUD: ${hud}`).toBeGreaterThanOrEqual(100);
        expect(analysis.marginMagenta ?? 0, 'magenta chromakey margins').toBeGreaterThanOrEqual(4);
        expect(rowsWithWalls, `row spread: ${JSON.stringify(analysis.rowStats)}`).toBeGreaterThanOrEqual(3);
        expect(bandPattern, `horizontal band: ${JSON.stringify(analysis.rowStats)}`).toBe(false);
        expect(consoleErrors.filter((e) => /shader|webgl/i.test(e))).toEqual([]);
      } finally {
        await page?.close().catch(() => {});
        await browser?.close().catch(() => {});
      }
    },
    180_000
  );
});
