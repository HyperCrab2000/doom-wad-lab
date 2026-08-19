#!/usr/bin/env tsx
/**
 * Capture Classic WebGL vs GZDoom modular (s) at spawn for multiple maps and report diff %.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/compare-classic-modular-maps.mts
 *   npx tsx tools/gzrender-v2/compare-classic-modular-maps.mts E1M1 MAP01 MAP02
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { diffPlayfieldPngFiles, formatFrameDiff } from '../../src/wad/parity/frame/frameDiff.ts';
import { waitClassicPlaying } from './waitClassicPlaying.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.BASE_URL ?? 'http://localhost:5150';
const DEFAULT_MAPS = ['E1M1', 'E1M2', 'MAP01', 'MAP02'];
const MAPS = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_MAPS;
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare');

async function captureClassicSpawn(page: puppeteer.Page, map: string): Promise<Buffer> {
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?renderer=classic&frameParity=1&map=${map}&_=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await waitClassicPlaying(page);
  await new Promise((r) => setTimeout(r, 1500));
  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    const glSource = (canvas as unknown as { __doomGlCanvas?: HTMLCanvasElement })?.__doomGlCanvas ?? canvas;
    const gl = glSource?.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl || !glSource) return null;
    gl.flush();
    const w = glSource.width;
    const h = glSource.height;
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
  if (!dataUrl) throw new Error(`Classic spawn capture failed for ${map}`);
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

async function captureModularSpawn(page: puppeteer.Page, map: string): Promise<Buffer> {
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?renderer=gzdoom-s-wasm&map=${map}&_=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-classic-play-state') === 'ready',
    { timeout: 240_000, polling: 300 },
  );
  await new Promise((r) => setTimeout(r, 2000));
  const canvas = await page.$('.gzdoom-wasm-play-canvas');
  if (!canvas) throw new Error(`modular canvas missing for ${map}`);
  return canvas.screenshot({ type: 'png' }) as Promise<Buffer>;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });

  const rows: { map: string; mismatchPct: number; identical: boolean }[] = [];

  try {
    const page = await browser.newPage();
    for (const map of MAPS) {
      const classicPath = path.join(OUT_DIR, `${map}-classic-spawn.png`);
      const modularPath = path.join(OUT_DIR, `${map}-modular-spawn.png`);
      fs.writeFileSync(classicPath, await captureClassicSpawn(page, map));
      fs.writeFileSync(modularPath, await captureModularSpawn(page, map));
      const diff = await diffPlayfieldPngFiles(classicPath, modularPath, { tolerance: 8 });
      rows.push({ map, mismatchPct: diff.mismatchRatio * 100, identical: diff.identical });
      console.log(`\n=== ${map} ===`);
      console.log(`Classic: ${classicPath}`);
      console.log(`Modular: ${modularPath}`);
      console.log(formatFrameDiff(diff));
    }
  } finally {
    await browser.close();
  }

  console.log('\n--- Summary ---');
  for (const row of rows) {
    console.log(`${row.map.padEnd(8)} ${row.mismatchPct.toFixed(2)}% mismatch${row.identical ? ' (identical)' : ''}`);
  }

  const worst = rows.reduce((a, b) => (a.mismatchPct > b.mismatchPct ? a : b));
  console.log(`Worst: ${worst.map} @ ${worst.mismatchPct.toFixed(2)}%`);

  if (process.env.CLASSIC_MODULAR_PARITY_REQUIRED === '1') {
    const failed = rows.filter((r) => r.mismatchPct > 5);
    if (failed.length > 0) {
      console.error(`FAIL: ${failed.length} map(s) above 5% threshold`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
