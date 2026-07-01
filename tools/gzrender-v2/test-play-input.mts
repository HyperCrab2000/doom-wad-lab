#!/usr/bin/env npx tsx
/**
 * Playable-input proof: drive the GZDoom WASM game with keyboard and confirm the view responds.
 * Captures the GL buffer (forced preserveDrawingBuffer) before/after input and reports the
 * fraction of changed pixels — proves the sim is running AND input reaches the engine.
 *
 * Usage: npx tsx tools/gzrender-v2/test-play-input.mts [map]
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MAP = process.argv[2] ?? 'E1M1';
const IWAD = MAP.startsWith('MAP') ? '/wads/DOOM2.WAD' : '/wads/DOOM.WAD';
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/play');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function grab(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.querySelector('#canvas') as HTMLCanvasElement | null;
    const gl = c?.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return [];
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out: number[] = [];
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) out.push(px[(y * w + x) * 4]!);
    return out;
  });
}

function changedFrac(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return -1;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > 12) diff++;
  return diff / a.length;
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
  channel: 'chrome',
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  const orig = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, id: string, attrs?: unknown) => unknown;
  HTMLCanvasElement.prototype.getContext = function (id: string, attrs?: Record<string, unknown>) {
    if (id === 'webgl2' || id === 'webgl') attrs = { ...(attrs ?? {}), preserveDrawingBuffer: true };
    return orig.call(this, id, attrs);
  } as typeof orig;
});
await page.setViewport({ width: 800, height: 600 });
await page.goto(`http://localhost:5150/gzdoom-oracle.html?play=${MAP}&iwad=${encodeURIComponent(IWAD)}&_=${Date.now()}`, {
  waitUntil: 'load',
  timeout: 180000,
});
await page.waitForFunction(() => window.__gzdoomOracleCapture?.done === true || window.__gzdoomOracleCapture?.error != null, {
  timeout: 180000,
  polling: 500,
});
await sleep(1000);

const readGametic = () =>
  page.evaluate(() => {
    const m = (window as unknown as { __gzHostedModule?: { _gzr_gametic?: () => number } }).__gzHostedModule;
    return m?._gzr_gametic ? m._gzr_gametic() : -1;
  });

// 0) Ground truth: does gametic advance? (sim loop running)
const tic0 = await readGametic();
await sleep(2000);
const tic1 = await readGametic();
console.log(`gametic: ${tic0} -> ${tic1} over 2s  => sim ${tic1 > tic0 ? 'TICKING' : (tic0 < 0 ? 'unknown(no export)' : 'FROZEN')}`);

// 1) NO-INPUT animation probe: animated textures/nukage in E1M1 start change if the sim ticks.
const idle0 = await grab(page);
await sleep(4000);
const idle1 = await grab(page);
const idleFrac = changedFrac(idle0, idle1);
console.log(`idle (no input) frame change over 4s: ${(idleFrac * 100).toFixed(1)}%  => sim ${idleFrac > 0.02 ? 'RUNNING' : 'frozen?'}`);

// 2) INPUT probe: focus, then test individual keys on a clean (in-game) state.
await page.evaluate(() => {
  const c = document.querySelector('#canvas') as HTMLCanvasElement | null;
  if (c) {
    c.setAttribute('tabindex', '0');
    c.focus();
  }
});
await sleep(200);

async function holdKey(key: string, ms: number): Promise<number> {
  const b = await grab(page);
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
  await sleep(250);
  const a = await grab(page);
  return changedFrac(b, a);
}

const turnRight = await holdKey('ArrowRight', 900);
console.log(`ArrowRight (turn): ${(turnRight * 100).toFixed(1)}%`);
const turnLeft = await holdKey('ArrowLeft', 900);
console.log(`ArrowLeft  (turn): ${(turnLeft * 100).toFixed(1)}%`);
const fwdW = await holdKey('w', 900);
console.log(`W (forward):       ${(fwdW * 100).toFixed(1)}%`);
const fire = await holdKey('Control', 500);
console.log(`Control (fire):    ${(fire * 100).toFixed(1)}%`);

const handle = await page.$('#canvas');
if (handle) await handle.screenshot({ path: path.join(OUT, `${MAP}-after-input.png`) });

const best = Math.max(turnRight, turnLeft, fwdW, fire);
console.log(`\n=> player-control input ${best > 0.1 ? 'WORKS' : 'NOT reaching gameplay'} (best ${(best * 100).toFixed(1)}%)`);
await browser.close();
process.exit(best > 0.1 ? 0 : 1);
