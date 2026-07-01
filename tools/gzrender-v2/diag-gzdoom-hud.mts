#!/usr/bin/env npx tsx
/**
 * Focused HUD diagnostic: wait for the GZDoom play canvas to exist + the game to settle, then save
 * a screenshot of ONLY the GZDoom play canvas element (CSS-correct 4:3 box). readPixels is NOT used
 * — GZDoom's WebGL context doesn't preserve the drawing buffer, so element.screenshot (composited)
 * is the only reliable view of what the user sees.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2/app-play');
const RENDERER = process.env.RENDERER ?? 'gzdoom-wasm';
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 70_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => {
      const t = m.text();
      if (/gzdoom\] Resolution|screenblocks|GZSTATE|SetWindowSize|HUDDBG/.test(t)) console.log(t);
    });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const url = `${BASE}/?renderer=${encodeURIComponent(RENDERER)}&_=${Date.now()}`;
    console.log(`Navigating: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 });

    await page.waitForSelector('canvas.gzdoom-wasm-play-canvas', { timeout: 180_000 });
    console.log(`HUDDIAG canvas exists; settling ${SETTLE_MS}ms for WASM load + first frames...`);
    await sleep(SETTLE_MS);

    const info = await page.$eval('canvas.gzdoom-wasm-play-canvas', (el) => {
      const c = el as HTMLCanvasElement;
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      return {
        drawingBuffer: { w: c.width, h: c.height },
        cssBox: { w: Math.round(r.width), h: Math.round(r.height), aspect: +(r.width / r.height).toFixed(3) },
        objectFit: cs.objectFit,
      };
    });
    console.log('HUDDIAG ' + JSON.stringify(info));

    const c = await page.$('canvas.gzdoom-wasm-play-canvas');
    if (c) {
      await c.screenshot({ path: path.join(OUT_DIR, 'gzdoom-hud-canvas.png') });
      console.log(`HUDDIAG element screenshot -> ${path.join(OUT_DIR, 'gzdoom-hud-canvas.png')}`);
    }
    await page.screenshot({ path: path.join(OUT_DIR, 'gzdoom-hud-fullpage.png') });
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
