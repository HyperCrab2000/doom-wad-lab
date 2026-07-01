#!/usr/bin/env tsx
/** Trace gzdoom-wasm Play tab until classic ready or stall (default 120s). */
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const WAIT_MS = Number(process.env.DIAG_WAIT_MS ?? '120000');
const URL = `${BASE}/?renderer=gzdoom-wasm`;

async function main() {
  const logs: string[] = [];
  const browser = await puppeteer.launch({
    headless: process.env.HEADED === '1' ? false : true,
    channel: 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || t.includes('useDoomLoader') || t.includes('WebGL')) {
      logs.push(`[${m.type()}] ${t.slice(0, 400)}`);
    }
  });
  page.on('pageerror', (e) => logs.push(`PAGE: ${e.message}`));

  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const wadSel = await page.$('.level-toolbar select');
  if (wadSel) await wadSel.select('/wads/DOOM.WAD');

  const started = Date.now();
  let last: Record<string, unknown> = {};
  const timeline: Record<string, unknown>[] = [];

  while (Date.now() - started < WAIT_MS) {
    const s = await page.evaluate(() => {
      const viewer = document.querySelector('.level-viewer');
      const game = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
      const overlay = document.querySelector('.gzdoom-play-loading');
      const gl = game?.getContext('webgl2');
      let pixel: number[] | null = null;
      if (gl && game && game.width > 0) {
        const p = new Uint8Array(4);
        gl.readPixels(
          Math.floor(game.width / 2),
          Math.floor(game.height / 2),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          p,
        );
        pixel = Array.from(p);
      }
      return {
        classic: viewer?.getAttribute('data-classic-play-state'),
        mapLoad: viewer?.getAttribute('data-map-load-state'),
        isPlaying: viewer?.getAttribute('data-is-playing'),
        playOverlay: overlay != null && getComputedStyle(overlay).display !== 'none',
        overlayText: overlay?.textContent?.trim() ?? null,
        hud: document.querySelector('canvas.doom-hud') != null,
        fps: document.getElementById('fps-counter')?.textContent ?? null,
        gameSize: game ? [game.width, game.height] : null,
        canvasHidden: game?.classList.contains('game-canvas--hidden') ?? null,
        pixel,
        h2: document.querySelector('.loader-title-group h2')?.textContent ?? null,
      };
    });
    s.t = Date.now() - started;
    timeline.push(s);
    last = s;

    if (s.classic === 'ready' && s.isPlaying === 'true' && !s.playOverlay) break;
    if (s.classic === 'error') break;

    await new Promise((r) => setTimeout(r, 1000));
  }

  const ok =
    last.classic === 'ready' &&
    last.isPlaying === 'true' &&
    !last.playOverlay &&
    (last.pixel as number[] | null)?.some((v) => v > 0);

  console.log(JSON.stringify({ ok, url: URL, last, samples: timeline.filter((_, i) => i % 5 === 0), logs }, null, 2));
  await browser.close();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
