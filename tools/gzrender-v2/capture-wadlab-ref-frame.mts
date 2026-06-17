#!/usr/bin/env tsx
/**
 * Capture Classic WebGL reference frame for frame parity (Stage 2).
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/capture-wadlab-ref-frame.mts [map] [out.png]
 *
 * Requires dev server: npm run dev (port 5150)
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { VISIBLE_PROBE_SCRIPT } from '../../test/browser/puppeteerVisibleProbe.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const MAP = process.argv[2] ?? 'E1M1';
const OUT = process.argv[3] ?? path.join(ROOT, 'artifacts/gzrender-v2/wadlab', `${MAP}.png`);
const VIEWPORT_W = 1280;
const VIEWPORT_H = 900;

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function capturePlayfieldPng(): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(VISIBLE_PROBE_SCRIPT);
    await page.setViewport({ width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/?renderer=classic&_=${Date.now()}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    await page.waitForFunction(
      () =>
        document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') === 'ready' &&
        document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
      { timeout: 120_000, polling: 250 },
    );

    if (MAP !== 'E1M1') {
      const selects = await page.$$('select');
      if (selects[1]) {
        await selects[1].select(MAP);
        await page.waitForFunction(
          () => document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') === 'ready',
          { timeout: 120_000, polling: 250 },
        );
        await new Promise((r) => setTimeout(r, 2500));
      }
    } else {
      await new Promise((r) => setTimeout(r, 2000));
    }

    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
        return (canvas?.width ?? 0) >= 320 && (canvas?.height ?? 0) >= 200;
      },
      { timeout: 30_000, polling: 250 },
    ).catch(async () => {
      await page.evaluate(() => {
        const viewer = document.querySelector('.level-viewer') as HTMLElement | null;
        const stage = document.querySelector('.game-stage') as HTMLElement | null;
        const viewport = document.querySelector('.game-card__viewport') as HTMLElement | null;
        if (viewer) viewer.style.height = '900px';
        if (stage) stage.style.minHeight = '840px';
        if (viewport) viewport.style.minHeight = '840px';
        window.dispatchEvent(new Event('resize'));
      });
      await new Promise((r) => setTimeout(r, 500));
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
          return (canvas?.width ?? 0) >= 320 && (canvas?.height ?? 0) >= 200;
        },
        { timeout: 30_000, polling: 250 },
      );
    });

    const dataUrl = await page.evaluate(() => {
      const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
      if (!canvas || canvas.width < 8 || canvas.height < 8) return null;
      const glSource =
        (canvas as HTMLCanvasElement & { __doomGlCanvas?: HTMLCanvasElement }).__doomGlCanvas ??
        canvas;
      const gl = glSource.getContext('webgl2', { preserveDrawingBuffer: true });
      if (!gl) return null;
      gl.flush();
      const w = glSource.width;
      const h = glSource.height;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      const image = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const src = ((h - 1 - y) * w + x) * 4;
          const dst = (y * w + x) * 4;
          image.data[dst] = buf[src]!;
          image.data[dst + 1] = buf[src + 1]!;
          image.data[dst + 2] = buf[src + 2]!;
          image.data[dst + 3] = buf[src + 3]!;
        }
      }
      ctx.putImageData(image, 0, 0);
      return out.toDataURL('image/png');
    });

    if (!dataUrl) throw new Error('Failed to read WebGL canvas');
    return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  if (!(await isServerUp())) {
    console.error(`Dev server not reachable at ${BASE} — run: npm run dev`);
    process.exit(2);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const png = await capturePlayfieldPng();
  fs.writeFileSync(OUT, png);
  console.log(`WAD Lab frame captured: ${OUT} (${VIEWPORT_W}x${VIEWPORT_H})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
