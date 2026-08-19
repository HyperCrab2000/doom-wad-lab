#!/usr/bin/env tsx
/**
 * Capture Classic + GZDoom modular at E1M1 spawn with matched viewport for parity diff.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { diffPlayfieldPngFiles, formatFrameDiff } from '../../src/wad/parity/frame/frameDiff.ts';
import { loadClassicParityMap } from './classicParityBrowserLoad.ts';
import { useClassicFrameParityCapture } from './classicParityCaptureMode.ts';
import { resolvePlayableWadPath } from '../../src/wad/parity/frame/goldIwad.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.BASE_URL ?? 'http://localhost:5150';
const MAP = process.argv[2] ?? 'E1M1';
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare');
const CLASSIC_PARITY_PITCH = process.env.CLASSIC_PARITY_PITCH;
const CLASSIC_PARITY_EYE_OFFSET = process.env.CLASSIC_PARITY_EYE_OFFSET;
const CLASSIC_VIEW_OVERRIDE = process.env.CLASSIC_VIEW_OVERRIDE;

function classicParityQuery(): string {
  const params = new URLSearchParams({
    renderer: 'classic',
    map: MAP,
    wad: resolvePlayableWadPath(MAP),
    _: String(Date.now()),
  });
  if (useClassicFrameParityCapture()) {
    params.set('frameParity', '1');
    if (CLASSIC_PARITY_PITCH != null) params.set('classicPitch', CLASSIC_PARITY_PITCH);
    if (CLASSIC_PARITY_EYE_OFFSET != null) params.set('classicEyeOffset', CLASSIC_PARITY_EYE_OFFSET);
    if (CLASSIC_VIEW_OVERRIDE != null) params.set('classicView', CLASSIC_VIEW_OVERRIDE);
  } else {
    // Freeze spawn pose + GZDoom parity pitch for apples-to-apples diff vs gold ref.png.
    params.set('spawnLock', '1');
  }
  return params.toString();
}

async function forcePreserveDrawingBuffer(page: puppeteer.Page, frameParity: boolean): Promise<void> {
  await page.evaluateOnNewDocument((injectFrameParity) => {
    if (injectFrameParity) {
      (window as Window & { __DOOM_FRAME_PARITY__?: boolean }).__DOOM_FRAME_PARITY__ = true;
    }
    const orig = HTMLCanvasElement.prototype.getContext as (
      this: HTMLCanvasElement,
      id: string,
      attrs?: unknown,
    ) => unknown;
    HTMLCanvasElement.prototype.getContext = function (id: string, attrs?: Record<string, unknown>) {
      if (id === 'webgl2' || id === 'webgl') attrs = { ...(attrs ?? {}), preserveDrawingBuffer: true };
      return orig.call(this, id, attrs);
    } as typeof orig;
  }, frameParity);
}

async function readWebGlCanvasPng(page: puppeteer.Page, selector: string): Promise<Buffer> {
  const dataUrl = await page.evaluate((canvasSelector) => {
    const canvas = document.querySelector(canvasSelector) as HTMLCanvasElement | null;
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
  }, selector);
  if (!dataUrl) throw new Error(`WebGL canvas capture failed: ${selector}`);
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

async function captureClassicSpawn(page: puppeteer.Page): Promise<Buffer> {
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  const frameParity = useClassicFrameParityCapture();
  const extraQuery: Record<string, string> = {};
  if (frameParity) {
    extraQuery.frameParity = '1';
    if (CLASSIC_PARITY_PITCH != null) extraQuery.classicPitch = CLASSIC_PARITY_PITCH;
    if (CLASSIC_PARITY_EYE_OFFSET != null) extraQuery.classicEyeOffset = CLASSIC_PARITY_EYE_OFFSET;
    if (CLASSIC_VIEW_OVERRIDE != null) extraQuery.classicView = CLASSIC_VIEW_OVERRIDE;
  } else {
    extraQuery.spawnLock = '1';
  }
  await loadClassicParityMap(page, BASE, MAP, extraQuery);
  await new Promise((r) => setTimeout(r, 2000));
  return readWebGlCanvasPng(page, '.game-canvas');
}

async function captureModularSpawn(page: puppeteer.Page): Promise<Buffer> {
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?renderer=gzdoom-wasm&gzdoomSubView=gold&map=${MAP}&_=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.waitForFunction(
    () => {
      const viewer = document.querySelector('.level-viewer');
      const img = document.querySelector('.gzdoom-wasm-frame') as HTMLImageElement | null;
      return viewer?.getAttribute('data-map-load-state') === 'ready' && Boolean(img?.complete && img.naturalWidth > 0);
    },
    { timeout: 240_000, polling: 300 },
  );
  const dataUrl = await page.evaluate(() => {
    const img = document.querySelector('.gzdoom-wasm-frame') as HTMLImageElement | null;
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  });
  if (!dataUrl) throw new Error('GZDoom gold image capture failed');
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

async function main(): Promise<void> {
  const frameParity = useClassicFrameParityCapture();
  const classicOnly = process.env.CLASSIC_ONLY === '1';
  console.log(
    frameParity
      ? 'Classic capture: frameParity oracle (CLASSIC_PARITY_FRAME=1)'
      : 'Classic capture: normal play spawn (default — no frameParity)',
  );
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  };
  if (process.env.PUPPETEER_CHANNEL) launchOpts.channel = process.env.PUPPETEER_CHANNEL;
  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await forcePreserveDrawingBuffer(page, frameParity);
    const classicPath = path.join(OUT_DIR, `${MAP}-classic-spawn.png`);
    fs.writeFileSync(classicPath, await captureClassicSpawn(page));
    console.log(`Classic: ${classicPath}`);
    if (classicOnly) return;
    const modularPath = path.join(OUT_DIR, `${MAP}-modular-spawn.png`);
    fs.writeFileSync(modularPath, await captureModularSpawn(page));
    const diff = await diffPlayfieldPngFiles(classicPath, modularPath, { tolerance: 8, layout: 'gzdoom-view' });
    console.log(`Classic: ${classicPath}`);
    console.log(`Modular: ${modularPath}`);
    console.log(formatFrameDiff(diff));
    if (process.env.CLASSIC_MODULAR_PARITY_REQUIRED === '1' && !diff.identical) {
      const mismatchPct = diff.mismatchRatio * 100;
      const max = Number(process.env.CLASSIC_PARITY_MAX_MISMATCH ?? '0');
      if (max > 0 && mismatchPct > max) {
        console.error(`FAIL: ${mismatchPct.toFixed(2)}% mismatch exceeds ${max}% gate`);
        process.exit(1);
      }
      if (max <= 0) {
        process.exit(1);
      }
      console.warn(`WARN: ${mismatchPct.toFixed(2)}% mismatch (gate ${max}% not yet met — tracking)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
