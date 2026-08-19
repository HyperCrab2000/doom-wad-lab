#!/usr/bin/env tsx
/** Sample playfield pixels at E1M1 spawn — diagnose missing flats / blue floor. */
import puppeteer from 'puppeteer';
import { waitClassicPlaying } from './waitClassicPlaying.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:5150';

async function main(): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/?renderer=classic&frameParity=1&map=E1M1&_=${Date.now()}`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await waitClassicPlaying(page);
  await new Promise((r) => setTimeout(r, 1500));

  const result = await page.evaluate(function () {
    const c = document.querySelector('canvas.game-canvas:not(.game-canvas--hidden)');
    if (!c) return { error: 'no canvas' };
    const gl = c.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) return { error: 'no gl' };
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    function sample(x, y) {
      const px = Math.floor(x * w);
      const py = Math.floor(y * h);
      const i = (py * w + px) * 4;
      return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
    }
    const stats = window.__doomDrawStats;
    return {
      canvas: { w, h },
      samples: {
        bottomCenter: sample(0.5, 0.92),
        midCenter: sample(0.5, 0.55),
        topCenter: sample(0.5, 0.08),
      },
      drawStats: stats ?? null,
    };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
