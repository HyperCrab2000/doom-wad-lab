#!/usr/bin/env npx tsx
/**
 * Capture the REAL React app Play tab (not the oracle harness) so we can see the HUD + aspect ratio
 * exactly as the user does. Drives http://localhost:5150/?renderer=gzdoom-wasm at a desktop viewport,
 * waits for the GZDoom play canvas to present a non-black frame, then screenshots + measures the
 * displayed canvas rectangle (true on-screen aspect) and the bottom chrome that may occlude the HUD.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2/app-play');
const VW = Number(process.env.VW ?? 1440);
const VH = Number(process.env.VH ?? 900);
const RENDERER = process.env.RENDERER ?? 'gzdoom-wasm';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-features=SharedArrayBuffer'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const logs: string[] = [];
  try {
    const page = await browser.newPage();
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 });

    const url = `${BASE}/?renderer=${encodeURIComponent(RENDERER)}&_=${Date.now()}`;
    console.log(`Navigating: ${url} (viewport ${VW}x${VH})`);
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 });

    if (RENDERER !== 'gzdoom-wasm') {
      await page.waitForFunction(
        () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
        { timeout: 180_000, polling: 500 },
      );
    }

    // Wait for the requested renderer's play canvas to exist and present a non-black center pixel.
    const ready = await page
      .waitForFunction(
        (renderer) => {
          const selector = renderer === 'gzdoom-wasm'
            ? 'canvas.gzdoom-wasm-play-canvas'
            : 'canvas.game-canvas';
          const c = document.querySelector(selector) as HTMLCanvasElement | null;
          if (!c) return false;
          const glSource = ((c as HTMLCanvasElement & { __doomGlCanvas?: HTMLCanvasElement }).__doomGlCanvas ?? c);
          const gl = glSource.getContext('webgl2');
          if (!gl) return false;
          const px = new Uint8Array(4);
          gl.readPixels(glSource.width >> 1, (glSource.height >> 1) - 40, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return px[0]! + px[1]! + px[2]! > 24;
        },
        { timeout: 150_000, polling: 1000 },
        RENDERER,
      )
      .then(() => true)
      .catch(() => false);

    console.log(`play canvas presented frame: ${ready}`);
    await sleep(1500);

    await page.screenshot({ path: path.join(OUT_DIR, 'app-fullpage.png') });

    const metrics = await page.evaluate(() => {
      const c = document.querySelector('canvas.gzdoom-wasm-play-canvas, canvas.game-canvas') as HTMLCanvasElement | null;
      const vp = document.querySelector('.game-card__viewport') as HTMLElement | null;
      const hud = document.querySelector('.gzdoom-wasm-hud') as HTMLElement | null;
      const cb = c?.getBoundingClientRect();
      const vb = vp?.getBoundingClientRect();
      const hb = hud?.getBoundingClientRect();
      return {
        canvasEl: c && cb ? { x: Math.round(cb.x), y: Math.round(cb.y), w: Math.round(cb.width), h: Math.round(cb.height), bufW: c.width, bufH: c.height, objectFit: getComputedStyle(c).objectFit } : null,
        viewport: vb ? { x: Math.round(vb.x), y: Math.round(vb.y), w: Math.round(vb.width), h: Math.round(vb.height) } : null,
        hud: hb ? { x: Math.round(hb.x), y: Math.round(hb.y), w: Math.round(hb.width), h: Math.round(hb.height) } : null,
      };
    });
    console.log(JSON.stringify(metrics, null, 2));
    if (metrics.canvasEl) {
      const { w, h } = metrics.canvasEl;
      console.log(`displayed canvas element box aspect = ${(w / h).toFixed(4)} (4:3 = 1.3333)`);
    }
    fs.writeFileSync(path.join(OUT_DIR, 'app-console.log'), logs.join('\n'));
    console.log(`screenshot -> ${path.join(OUT_DIR, 'app-fullpage.png')}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
