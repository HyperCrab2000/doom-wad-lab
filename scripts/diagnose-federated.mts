#!/usr/bin/env tsx
/** WASM Federated renderer — wait for map ready or report stall. */
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const WAIT_MS = Number(process.env.DIAG_WAIT_MS ?? '120000');
const URL = `${BASE}/?renderer=wasm-federated&_=${Date.now()}`;

async function main() {
  const logs: string[] = [];
  const browser = await puppeteer.launch({
    headless: process.env.HEADED === '1' ? false : true,
    channel: 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 500)}`));
  page.on('pageerror', (e) => logs.push(`PAGE: ${e.message}`));

  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 120_000 });

  const started = Date.now();
  let last: Record<string, unknown> = {};
  while (Date.now() - started < WAIT_MS) {
    last = await page.evaluate(() => {
      const game = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
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
        mapLoad: document.querySelector('.level-viewer')?.getAttribute('data-map-load-state'),
        isPlaying: document.querySelector('.level-viewer')?.getAttribute('data-is-playing'),
        statusLine: document.querySelector('.loader-status-line')?.textContent?.trim(),
        h2: document.querySelector('.loader-title-group h2')?.textContent,
        federatedHud: document.querySelector('.federated-wasm-hud')?.textContent?.trim(),
        canvasHidden: game?.classList.contains('game-canvas--hidden'),
        pixel,
        t: Date.now(),
      };
    });
    if (last.mapLoad === 'ready' && last.isPlaying === 'true' && last.pixel?.some((v: number) => v > 0)) break;
    if (last.mapLoad === 'error') break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(JSON.stringify({ ok: last.mapLoad === 'ready', url: URL, elapsedMs: Date.now() - started, last, logs: logs.slice(-20) }, null, 2));
  await browser.close();
  if (last.mapLoad !== 'ready') process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
