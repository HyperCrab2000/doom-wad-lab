#!/usr/bin/env tsx
/**
 * Play-mode smoke gate — normal Classic WebGL E1M1 spawn must draw walls, sky, and colormap.
 * Does NOT use frameParity=1 (that path is bisection-only).
 *
 * Requires: npm run dev on :5150
 *
 *   npm run test:classic-play-smoke
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { diffPlayfieldPngFiles, formatFrameDiff } from '../../src/wad/parity/frame/frameDiff.ts';
import { loadClassicParityMap } from './classicParityBrowserLoad.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.BASE_URL ?? process.env.TEST_URL ?? 'http://localhost:5150';
const MAP = process.argv[2] ?? 'E1M1';
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png');
const MAX_UPPER_BLACK_PCT = Number(process.env.CLASSIC_SMOKE_MAX_UPPER_BLACK_PCT ?? '25');
const MIN_WALL_ENTRIES = Number(process.env.CLASSIC_SMOKE_MIN_WALL_ENTRIES ?? '30');

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function forcePreserveDrawingBuffer(page: puppeteer.Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    const orig = HTMLCanvasElement.prototype.getContext as (
      this: HTMLCanvasElement,
      id: string,
      attrs?: unknown,
    ) => unknown;
    HTMLCanvasElement.prototype.getContext = function (id: string, attrs?: Record<string, unknown>) {
      if (id === 'webgl2' || id === 'webgl') attrs = { ...(attrs ?? {}), preserveDrawingBuffer: true };
      return orig.call(this, id, attrs);
    } as typeof orig;
  });
}

async function readPlayfieldRgb(
  page: puppeteer.Page,
  sx: number,
  sy: number,
): Promise<[number, number, number]> {
  return page.evaluate(
    (normX, normY) => {
      const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
      const glSource = (canvas as unknown as { __doomGlCanvas?: HTMLCanvasElement })?.__doomGlCanvas ?? canvas;
      const gl = glSource?.getContext('webgl2', { preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
      if (!gl || !glSource) return [0, 0, 0] as [number, number, number];
      gl.flush();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const playH = Math.round((h * 168) / 200);
      const glY = h - playH;
      const x = Math.floor(normX * w);
      const y = glY + Math.floor(normY * playH);
      const buf = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return [buf[0]!, buf[1]!, buf[2]!];
    },
    sx,
    sy,
  );
}

async function readUpperHalfBlackPct(page: puppeteer.Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    const glSource = (canvas as unknown as { __doomGlCanvas?: HTMLCanvasElement })?.__doomGlCanvas ?? canvas;
    const gl = glSource?.getContext('webgl2', { preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl || !glSource) return 100;
    gl.flush();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const playH = Math.round((h * 168) / 200);
    const glY = h - playH;
    let black = 0;
    let total = 0;
    for (let sy = 0; sy < 0.5; sy += 0.05) {
      for (let sx = 0.2; sx <= 0.8; sx += 0.1) {
        const x = Math.floor(sx * w);
        const y = glY + Math.floor(sy * playH);
        const buf = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        total++;
        if (buf[0]! <= 2 && buf[1]! <= 2 && buf[2]! <= 2) black++;
      }
    }
    return total > 0 ? (100 * black) / total : 100;
  });
}

async function capturePlayfieldPng(page: puppeteer.Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    const glSource = (canvas as unknown as { __doomGlCanvas?: HTMLCanvasElement })?.__doomGlCanvas ?? canvas;
    const gl = glSource?.getContext('webgl2', { preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl || !glSource) return null;
    gl.flush();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
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
  if (!dataUrl) throw new Error('WebGL capture failed');
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

function isVoidPixel([r, g, b]: [number, number, number], stats: Record<string, unknown> | null): boolean {
  if (r === 0 && g === 0 && b === 0) return true;
  // playpal[6]=19 alone is fine when sky + walls are active (courtyard opening at spawn).
  if (r === 19 && g === 19 && b === 19) {
    const walls = Number(stats?.walls ?? 0);
    return walls < 5 && stats?.skyActive !== true;
  }
  return false;
}

function isNearBlack([r, g, b]: [number, number, number]): boolean {
  return r <= 2 && g <= 2 && b <= 2;
}

async function main(): Promise<void> {
  if (!(await isServerUp())) {
    console.error(`FAIL: dev server not reachable at ${BASE}`);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });

  try {
    const page = await browser.newPage();
    await forcePreserveDrawingBuffer(page);
    await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
    await loadClassicParityMap(page, BASE, MAP);
    await new Promise((r) => setTimeout(r, 2000));

    const stats = await page.evaluate(() => {
      const s = (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats;
      return s ?? null;
    });
    const center = await readPlayfieldRgb(page, 0.5, 0.5);
    const topCenter = await readPlayfieldRgb(page, 0.5, 0.08);
    const upperBlackPct = await readUpperHalfBlackPct(page);

    let goldMismatchPct: number | null = null;
    if (fs.existsSync(GOLD)) {
      const png = await capturePlayfieldPng(page);
      const tmp = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare', `${MAP}-classic-play-smoke.png`);
      fs.mkdirSync(path.dirname(tmp), { recursive: true });
      fs.writeFileSync(tmp, png);
      const diff = await diffPlayfieldPngFiles(tmp, GOLD, { tolerance: 8 });
      goldMismatchPct = diff.mismatchRatio * 100;
      console.log(`gold diff: ${formatFrameDiff(diff)}`);
    }

    console.log(`Classic play smoke @ ${BASE} map=${MAP}`);
    console.log('drawStats:', JSON.stringify(stats, null, 2));
    console.log(`playfield top-center RGB: ${topCenter.join(',')}`);
    console.log(`playfield center RGB: ${center.join(',')}`);
    console.log(`upper-half near-black: ${upperBlackPct.toFixed(1)}% (gate <= ${MAX_UPPER_BLACK_PCT}%)`);

    const walls = Number(stats?.walls ?? 0);
    const wallEntries = Number(stats?.wallEntries ?? 0);
    const skyActive = stats?.skyActive === true;
    const gzdoomColormap = stats?.gzdoomColormap === true;
    const voidCenter = isVoidPixel(center, stats);

    let failed = false;
    if (walls < 15) {
      console.error(`FAIL: walls=${walls} (expected >= 15)`);
      failed = true;
    }
    if (wallEntries < MIN_WALL_ENTRIES) {
      console.error(`FAIL: wallEntries=${wallEntries} (expected >= ${MIN_WALL_ENTRIES})`);
      failed = true;
    }
    if (!skyActive) {
      console.error('FAIL: skyActive is not true');
      failed = true;
    }
    if (!gzdoomColormap) {
      console.error('FAIL: gzdoomColormap is not true');
      failed = true;
    }
    if (voidCenter) {
      console.error(`FAIL: playfield center is void black (${center.join(',')})`);
      failed = true;
    }
    if (isNearBlack(topCenter)) {
      console.error(`FAIL: playfield top-center is near-black (${topCenter.join(',')}) — sky/ceiling void`);
      failed = true;
    }
    if (upperBlackPct > MAX_UPPER_BLACK_PCT) {
      console.error(
        `FAIL: upper playfield ${upperBlackPct.toFixed(1)}% near-black (gate <= ${MAX_UPPER_BLACK_PCT}%)`,
      );
      failed = true;
    }
    if (goldMismatchPct != null) {
      console.log(
        `gold mismatch (normal play pitch 0 vs gold spawnLock ref): ${goldMismatchPct.toFixed(2)}% — see test:classic-parity-buckets-gate`,
      );
    }

    if (failed) process.exit(1);
    console.log('PASS: normal play draws walls, sky, colormap; playfield not void');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
