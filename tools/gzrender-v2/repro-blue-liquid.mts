#!/usr/bin/env npx tsx
/**
 * Reproduce the "blue liquid" the user sees in the live React Play tab. The single-frame parity gold
 * does NOT show it (animation never advances there), so we drive the full running game in the real
 * app: walk forward into E1M1's nukage, then burst-capture the play-canvas region over time to catch
 * the animated flat cycling.
 *
 * Usage: npx tsx tools/gzrender-v2/repro-blue-liquid.mts
 * Requires: npm run dev (5150) + a current build:gzdoom-wasm
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createCanvas, loadImage } from 'canvas';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2/blue-liquid');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function blueStats(file: string) {
  const img = await loadImage(file);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  let blue = 0, green = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    if (b > 70 && b > r + 35 && b > g + 25) blue++;
    if (g > 60 && g > r + 20 && g > b + 20) green++;
  }
  return { blue, green };
}

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
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const url = `${BASE}/?renderer=gzdoom-wasm&_=${Date.now()}`;
    console.log(`Navigating: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 });

    const ready = await page.waitForFunction(
      () => {
        const c = document.querySelector('canvas.gzdoom-wasm-play-canvas') as HTMLCanvasElement | null;
        if (!c) return false;
        const gl = c.getContext('webgl2');
        if (!gl) return false;
        const px = new Uint8Array(4);
        gl.readPixels(c.width >> 1, (c.height >> 1) - 40, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px[0]! + px[1]! + px[2]! > 24;
      },
      { timeout: 150_000, polling: 1000 },
    ).then(() => true).catch(() => false);
    console.log(`play canvas presented frame: ${ready}`);
    await sleep(1200);

    const rect = await page.evaluate(() => {
      const c = document.querySelector('canvas.gzdoom-wasm-play-canvas') as HTMLCanvasElement | null;
      if (!c) return null;
      const b = c.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    });
    if (!rect) throw new Error('no play canvas');
    console.log(`canvas rect ${JSON.stringify(rect)}`);
    const clip = { x: rect.x, y: rect.y, width: rect.w, height: rect.h };

    await page.mouse.click(rect.x + rect.w / 2, rect.y + rect.h / 2);
    await sleep(400);

    // Enable noclip via the console so we can reliably fly to the nukage pit regardless of walls.
    await page.keyboard.press('Backquote');
    await sleep(300);
    await page.keyboard.type('noclip', { delay: 30 });
    await page.keyboard.press('Enter');
    await sleep(200);
    await page.keyboard.press('Backquote');
    await sleep(300);

    // Walk forward through the level, capturing continuously (catch animation + position changes).
    const rows: string[] = [];
    await page.keyboard.down('w');
    for (let i = 0; i < 24; i++) {
      const p = path.join(OUT_DIR, `app-${String(i).padStart(2, '0')}.png`);
      await page.screenshot({ path: p, clip });
      const s = await blueStats(p);
      rows.push(`frame ${String(i).padStart(2)}: blue=${String(s.blue).padStart(7)} green=${String(s.green).padStart(7)}`);
      await sleep(250);
    }
    await page.keyboard.up('w');
    console.log(rows.join('\n'));
    fs.writeFileSync(path.join(OUT_DIR, `app-console.log`), logs.join('\n'));
    console.log(`frames + log in ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
