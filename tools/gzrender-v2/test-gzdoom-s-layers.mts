#!/usr/bin/env npx tsx
/**
 * Toggle GZDoom (s) layer checkboxes LIVE (no refresh) and verify viewport stays full-frame.
 *
 * Usage: npx tsx tools/gzrender-v2/test-gzdoom-s-layers.mts
 * Requires: npm run dev (5150)
 */
import puppeteer, { type Page } from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function forcePreserveDrawingBuffer(page: Page): Promise<void> {
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

async function waitPlayReady(page: Page, timeoutMs = 180_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await page.evaluate(() =>
      document.querySelector('.level-viewer')?.getAttribute('data-classic-play-state'),
    );
    if (state === 'ready') return;
    if (state === 'error') throw new Error('play entered error state');
    await sleep(500);
  }
  throw new Error('play never became ready');
}

async function readFill(page: Page): Promise<{ fill: number; w: number; h: number; sig: number }> {
  return page.evaluate(() => {
    const c = document.querySelector('canvas.gzdoom-wasm-play-canvas') as HTMLCanvasElement | null;
    if (!c) return { fill: 0, w: 0, h: 0, sig: 0 };
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return { fill: 0, w: c.width, h: c.height, sig: 0 };
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let nonBlack = 0;
    let sig = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const lum = px[i]! + px[i + 1]! + px[i + 2]!;
        if (lum > 24) nonBlack++;
        if (x % 31 === 0 && y % 31 === 0) sig = (sig * 31 + lum) >>> 0;
      }
    }
    return { fill: nonBlack / (w * h), w, h, sig };
  });
}

async function collectConsoleUnknownCommands(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __gzTestLogs?: string[] };
    return w.__gzTestLogs ?? [];
  });
}

async function toggleWallsOff(page: Page): Promise<void> {
  await page.click('.layer-rail__toggle');
  await sleep(300);
  await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll('.render-layer-panel__group'));
    const geo = groups.find((g) => g.querySelector('h4')?.textContent?.trim() === 'Geometry');
    const walls = geo?.querySelector('.render-layer-panel__row-item input[type=checkbox]') as HTMLInputElement | null;
    if (!walls) throw new Error('Geometry Walls checkbox not found');
    if (walls.checked) walls.click();
  });
}

async function main(): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await forcePreserveDrawingBuffer(page);
  await page.setViewport({ width: 1280, height: 900 });

  await page.evaluateOnNewDocument(() => {
    (window as unknown as { __gzTestLogs?: string[] }).__gzTestLogs = [];
    const orig = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');
      if (msg.includes('Unknown command')) {
        (window as unknown as { __gzTestLogs?: string[] }).__gzTestLogs?.push(msg);
      }
      orig(...args);
    };
  });

  const url = `${BASE}/?renderer=gzdoom-s-wasm&_=${Date.now()}`;
  console.log('nav:', url);
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await waitPlayReady(page);
  await sleep(2000);

  const before = await readFill(page);
  console.log(`before toggle: ${before.w}x${before.h} fill=${before.fill.toFixed(3)} sig=${before.sig}`);
  if (before.fill < 0.5) {
    throw new Error(`initial frame not full (${(before.fill * 100).toFixed(1)}% fill) — corner-box bug`);
  }

  const playStateBefore = await page.evaluate(() =>
    document.querySelector('.level-viewer')?.getAttribute('data-classic-play-state'),
  );
  if (playStateBefore !== 'ready') {
    throw new Error(`expected ready before toggle, got ${playStateBefore}`);
  }

  await toggleWallsOff(page);
  console.log('toggled Walls off live (no refresh expected)…');
  await sleep(1500);

  const playStateAfter = await page.evaluate(() =>
    document.querySelector('.level-viewer')?.getAttribute('data-classic-play-state'),
  );
  if (playStateAfter !== 'ready') {
    throw new Error(`live toggle must not reload WASM — play state became ${playStateAfter}`);
  }

  const unknownCmds = await collectConsoleUnknownCommands(page);
  if (unknownCmds.length > 0) {
    throw new Error(`Unknown CVAR commands during live toggle:\n${unknownCmds.join('\n')}`);
  }

  const rootLen = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0);
  if (rootLen < 100) {
    throw new Error('React root wiped after layer toggle (crash)');
  }

  const after = await readFill(page);
  console.log(`after toggle:  ${after.w}x${after.h} fill=${after.fill.toFixed(3)} sig=${after.sig}`);
  if (after.fill < 0.5) {
    throw new Error(`after layer toggle frame corner-boxed (${(after.fill * 100).toFixed(1)}% fill)`);
  }
  if (after.sig === before.sig) {
    throw new Error('layer toggle did not change the frame (walls off had no visible effect)');
  }
  if (after.w !== 1280 || after.h !== 960) {
    throw new Error(`unexpected buffer size ${after.w}x${after.h} (expected 1280x960)`);
  }

  console.log('\n=== RESULT: PASS (live layer toggle, full-frame preserved, no unknown CVARs) ===');
  await browser.close();
}

main().catch(async (err) => {
  console.error('\n=== RESULT: FAIL ===');
  console.error(err);
  process.exit(1);
});
