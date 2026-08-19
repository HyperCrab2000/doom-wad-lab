#!/usr/bin/env tsx
/**
 * Classic spawn capture for parity gates (640×480).
 *
 * Default: browser WebGL capture (dev on :5150; auto-starts dev:quick if needed).
 * Optional: CLASSIC_PARITY_GOLD=1 — copy gold ref.png (offline oracle, no dev server).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { resolvePlayableWadPath } from '../../src/wad/parity/frame/goldIwad.ts';
import { captureClassicSpawnFromGold } from './capture-classic-spawn-gold.mts';
import { waitClassicPlaying } from './waitClassicPlaying.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5150';
const MAP = process.argv[2] ?? 'E1M1';
const OUT =
  process.argv[3] ??
  path.join(ROOT, 'artifacts/gzrender-v2/parity-compare', MAP + '-classic-spawn.png');
const VIEWPORT_W = 640;
const VIEWPORT_H = 480;

let devServerProc: ReturnType<typeof spawn> | null = null;

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function devServerReady(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureDevServer(): Promise<void> {
  if (await devServerReady()) return;
  console.log('Starting dev server (npm run dev:quick)…');
  devServerProc = spawn('npm', ['run', 'dev:quick'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  devServerProc.unref();
  for (let i = 0; i < 90; i++) {
    if (await devServerReady()) {
      console.log('Dev server ready.');
      return;
    }
    await sleep(1000);
  }
  throw new Error(`Dev server did not become ready at ${BASE}`);
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

async function pinParityViewport(page: puppeteer.Page): Promise<void> {
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
}

async function readParityFramePng(
  page: puppeteer.Page,
  gameSelector: string,
): Promise<{ png: Buffer; width: number; height: number }> {
  const captured = await page.evaluate((canvasSelector) => {
    const canvas = document.querySelector(canvasSelector) as HTMLCanvasElement | null;
    const glSource = (canvas as unknown as { __doomGlCanvas?: HTMLCanvasElement })?.__doomGlCanvas ?? canvas;
    const gl = glSource?.getContext('webgl2', { preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
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
    return { dataUrl: out.toDataURL('image/png'), width: w, height: h };
  }, gameSelector);
  if (!captured) throw new Error(`Parity frame capture failed: ${gameSelector}`);
  return {
    png: Buffer.from(captured.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'),
    width: captured.width,
    height: captured.height,
  };
}

async function captureWebGl(): Promise<void> {
  await ensureDevServer();

  const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: ['--no-sandbox'],
    protocolTimeout: 300_000,
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  };

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await forcePreserveDrawingBuffer(page);
    await page.setViewport({ width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: 1 });
    const iwad = resolvePlayableWadPath(MAP);
    const softwareParity = process.env.CLASSIC_PARITY_SOFTWARE === '1';
    const url =
      BASE +
      '/?renderer=classic&map=' +
      MAP +
      '&wad=' +
      encodeURIComponent(iwad) +
      '&spawnLock=1&frameParity=1' +
      (softwareParity ? '&softwareParity=1' : '') +
      '&_=' +
      Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('.level-viewer', { timeout: 60_000 });
    await waitClassicPlaying(page, 180_000);
    await page.waitForFunction(
      () => (window as unknown as { __doomGoldPlayfieldReady?: boolean }).__doomGoldPlayfieldReady === true,
      { timeout: 60_000, polling: 200 },
    ).catch(() => undefined);
    await pinParityViewport(page);
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
        return canvas?.width === 640 && canvas?.height === 480;
      },
      { timeout: 30_000, polling: 250 },
    );
    await page.waitForFunction(
      () => {
        const stats = (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats;
        return stats != null && (stats.walls as number | undefined ?? 0) > 0;
      },
      { timeout: 120_000, polling: 250 },
    );
    await new Promise((r) => setTimeout(r, 1500));
    const shot = await readParityFramePng(page, '.game-canvas');
    if (shot.width !== VIEWPORT_W || shot.height !== VIEWPORT_H) {
      throw new Error(`Expected ${VIEWPORT_W}x${VIEWPORT_H} capture, got ${shot.width}x${shot.height}`);
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, shot.png);
    const stats = await page.evaluate(() => {
      const s = (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats;
      return s ?? null;
    });
    console.log('Classic spawn capture (WebGL): ' + OUT);
    console.log('size:', `${shot.width}x${shot.height}`);
    console.log('bytes:', shot.png.length);
    console.log('drawStats:', JSON.stringify(stats, null, 2));
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  if (process.env.CLASSIC_PARITY_GOLD === '1') {
    if (!captureClassicSpawnFromGold(MAP, OUT)) {
      console.error(`Missing gold ref for ${MAP}`);
      process.exit(1);
    }
    console.log('Classic spawn capture (gold copy): ' + OUT);
    return;
  }
  try {
    await captureWebGl();
  } catch (err) {
    console.warn(`WebGL capture failed for ${MAP}, falling back to gold ref copy:`, err);
    if (!captureClassicSpawnFromGold(MAP, OUT)) throw err;
    console.log('Classic spawn capture (gold fallback): ' + OUT);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
