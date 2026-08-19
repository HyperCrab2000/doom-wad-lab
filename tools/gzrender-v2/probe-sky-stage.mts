#!/usr/bin/env npx tsx
/** Capture sky-only stage and sample top/mid pixels vs gold. */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { diffPlayfieldPngFiles, loadPng, extractGzdoomView, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';
import { waitClassicPlaying } from './waitClassicPlaying.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5150';
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png');
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-stage-sky.png');

async function samplePlayfieldPng(pngPath: string, x: number, y: number): Promise<number[]> {
  const img = await loadPng(pngPath);
  const view = extractGzdoomView(img.data, img.width, img.height);
  const pf = resizePlayfieldToVanilla(view.data, view.width, view.height);
  const i = (y * 320 + x) * 4;
  return [pf.data[i]!, pf.data[i + 1]!, pf.data[i + 2]!];
}

async function main(): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    const orig = HTMLCanvasElement.prototype.getContext as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (id, attrs) {
      if (id === 'webgl2' || id === 'webgl') attrs = { ...(attrs as Record<string, unknown> ?? {}), preserveDrawingBuffer: true };
      return orig.call(this, id, attrs);
    };
  });

  const params = new URLSearchParams({
    renderer: 'classic',
    frameParity: '1',
    map: 'E1M1',
    modStage: 'sky',
    _: String(Date.now()),
  });
  await page.setViewport({ width: 640, height: 480 });
  await page.goto(`${BASE}/?${params}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitClassicPlaying(page);
  await new Promise((r) => setTimeout(r, 2000));

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
  const stats = await page.evaluate(() => (window as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats ?? {});
  await browser.close();

  if (!dataUrl) throw new Error('capture failed');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));

  const diff = await diffPlayfieldPngFiles(OUT, GOLD, { tolerance: 8, layout: 'gzdoom-view' });
  console.log('sky-only mismatch', (diff.mismatchRatio * 100).toFixed(2) + '%');
  console.log('stats', JSON.stringify(stats, null, 2));
  for (const y of [5, 20, 40, 60, 100]) {
    for (const x of [80, 160, 240]) {
      const gold = await samplePlayfieldPng(GOLD, x, y);
      const classic = await samplePlayfieldPng(OUT, x, y);
      const delta = Math.max(
        Math.abs(gold[0]! - classic[0]!),
        Math.abs(gold[1]! - classic[1]!),
        Math.abs(gold[2]! - classic[2]!),
      );
      console.log(`x=${x} y=${y} gold=${gold.join(',')} sky=${classic.join(',')} delta=${delta}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
