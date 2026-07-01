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
/** Match GZDoom ref capture: 640×480 vanilla framebuffer (GAP-0001). */
const VIEWPORT_W = 640;
const VIEWPORT_H = 480;

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function capturePlayfieldPng(): Promise<{ buffer: Buffer; width: number; height: number }> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  try {
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' || text.includes('shader') || text.includes('Shader')) {
        pageErrors.push(text);
      }
    });
    await page.evaluateOnNewDocument(`window.__DOOM_FRAME_PARITY__ = true;\nwindow.__DOOM_SOFTWARE_PARITY__ = true;\n${VISIBLE_PROBE_SCRIPT}`);
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    // Explicitly request the Classic backend. The app default is now gzdoom-wasm, which renders into
    // its own canvas and leaves .game-canvas (what we read below) empty/black. ?renderer=classic is
    // honoured by readDefaultRenderBackend().
    await page.goto(`${BASE}/?renderer=classic&frameParity=1&_=${Date.now()}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    await page.waitForSelector('.level-viewer', { timeout: 120_000 });

    const wadSelect = await page.$('.level-toolbar select');
    if (wadSelect) {
      await wadSelect.select('/wads/DOOM.WAD');
    } else {
      const selects = await page.$$('select');
      if (selects.length >= 1) {
        await selects[0]!.select('/wads/DOOM.WAD');
      }
    }

    if (MAP !== 'E1M1') {
      const mapSelects = await page.$$('.level-toolbar select');
      if (mapSelects.length >= 2) {
        await mapSelects[1]!.select(MAP);
      }
    }

    await page.waitForFunction(
      () => document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') === 'ready',
      { timeout: 120_000, polling: 250 },
    );

    await page.waitForFunction(
      () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
      { timeout: 120_000, polling: 250 },
    );

    await page.setViewport({ width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: 1 });

    await page.evaluate(`
(function() {
  function hide(sel) {
    var el = document.querySelector(sel);
    if (el) el.style.display = 'none';
  }
  hide('.hero');
  hide('.level-toolbar');
  hide('.doom-loader');
  hide('.fps-counter');
  hide('.voxel-counter');
  hide('.game-card__caption');
  hide('.render-layer-panel');
  var shell = document.querySelector('.app-shell');
  var main = document.querySelector('.app-main');
  var viewer = document.querySelector('.level-viewer');
  var stage = document.querySelector('.game-stage');
  var card = document.querySelector('.game-card');
  var viewport = document.querySelector('.game-card__viewport');
  var full = 'position:fixed;left:0;top:0;width:640px;height:480px;margin:0;padding:0;';
  if (shell) shell.style.cssText = full + 'overflow:hidden;';
  if (main) main.style.cssText = full;
  if (viewer) { viewer.style.cssText = full; viewer.classList.add('level-viewer--playing'); }
  if (stage) stage.style.cssText = full;
  if (card) card.style.cssText = full + 'border:none;';
  if (viewport) viewport.style.cssText = 'position:absolute;inset:0;width:640px;height:480px;';
  window.dispatchEvent(new Event('resize'));
})()
    `);

    await new Promise((r) => setTimeout(r, 2500));

    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
        return canvas?.width === 640 && canvas?.height === 480;
      },
      { timeout: 30_000, polling: 250 },
    );

    const captured = await page.evaluate(`
(function() {
  var canvas = document.querySelector('.game-canvas');
  if (!canvas || canvas.width < 8 || canvas.height < 8) return null;
  var glSource = canvas.__doomGlCanvas || canvas;
  var gl = glSource.getContext('webgl2', { preserveDrawingBuffer: true });
  if (!gl) return null;
  gl.flush();
  var w = glSource.width;
  var h = glSource.height;
  var buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  var out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  var ctx = out.getContext('2d');
  if (!ctx) return null;
  var image = ctx.createImageData(w, h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var src = ((h - 1 - y) * w + x) * 4;
      var dst = (y * w + x) * 4;
      image.data[dst] = buf[src];
      image.data[dst + 1] = buf[src + 1];
      image.data[dst + 2] = buf[src + 2];
      image.data[dst + 3] = buf[src + 3];
    }
  }
  ctx.putImageData(image, 0, 0);
  return { dataUrl: out.toDataURL('image/png'), width: w, height: h };
})()
    `) as { dataUrl: string; width: number; height: number } | null;

    if (!captured) {
      throw new Error(`Failed to read WebGL canvas${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
    }
    if (pageErrors.length) {
      console.warn(`Browser warnings/errors (${pageErrors.length}): ${pageErrors.slice(0, 5).join(' | ')}`);
    }
    return {
      buffer: Buffer.from(captured.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'),
      width: captured.width,
      height: captured.height,
    };
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
  const { buffer, width, height } = await capturePlayfieldPng();
  fs.writeFileSync(OUT, buffer);
  console.log(`WAD Lab frame captured: ${OUT} (${width}x${height}, viewport ${VIEWPORT_W}x${VIEWPORT_H})`);
  if (width !== VIEWPORT_W || height !== VIEWPORT_H) {
    console.error(`WARNING: canvas ${width}x${height} != target ${VIEWPORT_W}x${VIEWPORT_H}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
