#!/usr/bin/env npx tsx
/**
 * Classic renderer — live layer toggles (no reload).
 *
 * Usage: npx tsx tools/gzrender-v2/test-classic-layers.mts
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

async function waitClassicReady(page: Page, timeoutMs = 120_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await page.evaluate(() => ({
      mapState: document.querySelector('.level-viewer')?.getAttribute('data-map-load-state'),
      playing: document.querySelector('.level-viewer')?.getAttribute('data-is-playing'),
      canvasHidden: document.querySelector('canvas.game-canvas')?.classList.contains('game-canvas--hidden'),
    }));
    if (state.mapState === 'ready' && state.playing === 'true' && !state.canvasHidden) return;
    if (state.mapState === 'error') throw new Error('classic map load error');
    await sleep(400);
  }
  throw new Error('classic never became ready/visible');
}

async function readClassicFrame(page: Page): Promise<{ fill: number; sig: number; w: number; h: number }> {
  return page.evaluate(() => {
    const c = document.querySelector('canvas.game-canvas:not(.game-canvas--hidden)') as HTMLCanvasElement | null;
    if (!c || c.width < 8) return { fill: 0, sig: 0, w: 0, h: 0 };
    const gl = c.getContext('webgl2', { preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl) return { fill: 0, sig: 0, w: c.width, h: c.height };
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let nonBlack = 0;
    let sig = 0;
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const i = (y * w + x) * 4;
        const lum = px[i]! + px[i + 1]! + px[i + 2]!;
        if (lum > 24) nonBlack++;
        sig = (sig * 31 + lum) >>> 0;
      }
    }
    const samples = Math.ceil(w / 4) * Math.ceil(h / 4);
    return { fill: nonBlack / samples, sig, w, h };
  });
}

async function readLayerDiagnostics(page: Page) {
  return page.evaluate(() => {
    const stats = (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats;
    const diag = (window as unknown as {
      __classicLayerDiagnostics?: { layers?: Array<{ id: string; active: boolean }> };
    }).__classicLayerDiagnostics;
    return {
      wallsDrawn: Number(stats?.walls ?? 0),
      flatsDrawn: Number(stats?.flats ?? 0),
      inactiveLayers:
        diag?.layers?.filter((l) => !l.active).map((l) => l.id) ??
        (stats?.inactiveLayers as string[] | undefined) ??
        [],
    };
  });
}

async function toggleWallsOff(page: Page): Promise<void> {
  await page.click('.layer-rail__toggle');
  await sleep(250);
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

  const url = `${BASE}/?renderer=classic&map=E1M1&_=${Date.now()}`;
  console.log('nav:', url);
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await waitClassicReady(page);
  await sleep(2500);

  const before = await readClassicFrame(page);
  const diagBefore = await readLayerDiagnostics(page);
  console.log(`before: fill=${before.fill.toFixed(3)} sig=${before.sig} wallsDrawn=${diagBefore.wallsDrawn}`);

  if (before.fill < 0.15) {
    throw new Error(`classic frame too empty (${(before.fill * 100).toFixed(1)}%)`);
  }

  await toggleWallsOff(page);
  console.log('toggled Walls off live…');
  await sleep(1200);

  const mapState = await page.evaluate(() =>
    document.querySelector('.level-viewer')?.getAttribute('data-map-load-state'),
  );
  if (mapState !== 'ready') {
    throw new Error(`walls toggle triggered reload — map state ${mapState}`);
  }

  const after = await readClassicFrame(page);
  const diagAfter = await readLayerDiagnostics(page);
  console.log(
    `after:  fill=${after.fill.toFixed(3)} sig=${after.sig} wallsDrawn=${diagAfter.wallsDrawn} inactive=${diagAfter.inactiveLayers.join(',')}`,
  );

  if (!diagAfter.inactiveLayers.includes('walls-solid')) {
    throw new Error(`expected walls-solid inactive, got ${diagAfter.inactiveLayers.join(',')}`);
  }
  if (diagAfter.wallsDrawn >= diagBefore.wallsDrawn && diagBefore.wallsDrawn > 0) {
    throw new Error('walls draw count did not drop after toggle');
  }
  if (after.sig === before.sig) {
    throw new Error('frame signature unchanged — walls toggle had no visible effect');
  }

  const rootLen = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0);
  if (rootLen < 100) throw new Error('React root wiped');

  console.log('\n=== RESULT: PASS (classic live layer toggle) ===');
  await browser.close();
}

main().catch(async (err) => {
  console.error('\n=== RESULT: FAIL ===');
  console.error(err);
  process.exit(1);
});
