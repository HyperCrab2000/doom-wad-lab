#!/usr/bin/env npx tsx
/**
 * Classic renderer — per-layer preset matrix (live toggles, no reload).
 *
 * Usage: npx tsx tools/gzrender-v2/test-classic-layers-matrix.mts
 */
import puppeteer, { type Page } from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface LayerCase {
  preset: string;
  expectInactive: string[];
  expectActive?: string[];
  minFill?: number;
}

const CASES: LayerCase[] = [
  {
    preset: 'walls-off',
    expectInactive: ['walls-solid', 'walls-texture'],
    expectActive: ['floors', 'ceilings'],
    minFill: 0.08,
  },
  {
    preset: 'walls-solid',
    expectInactive: ['floors', 'ceilings', 'sky'],
    expectActive: ['walls-solid'],
    minFill: 0.05,
  },
  {
    preset: 'floors',
    expectInactive: ['walls-solid', 'ceilings', 'sky'],
    expectActive: ['floors'],
    minFill: 0.05,
  },
  {
    preset: 'ceilings',
    expectInactive: ['walls-solid', 'floors', 'sky'],
    expectActive: ['ceilings'],
    minFill: 0.05,
  },
  {
    preset: 'sky',
    expectInactive: ['walls-solid', 'floors'],
    expectActive: ['sky', 'ceilings'],
    minFill: 0.05,
  },
];

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

async function waitClassicReady(page: Page): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
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

async function readFrame(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector('canvas.game-canvas:not(.game-canvas--hidden)') as HTMLCanvasElement | null;
    if (!c) return 0;
    const gl = c.getContext('webgl2', { preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl) return 0;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let nonBlack = 0;
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const i = (y * w + x) * 4;
        if (px[i]! + px[i + 1]! + px[i + 2]! > 24) nonBlack++;
      }
    }
    return nonBlack / (Math.ceil(w / 4) * Math.ceil(h / 4));
  });
}

async function applyPreset(page: Page, preset: string) {
  const ok = await page.evaluate((p) => {
    const fn = (window as unknown as { __applyClassicLayerPreset?: (id: string) => unknown })
      .__applyClassicLayerPreset;
    if (!fn) return false;
    fn(p);
    return true;
  }, preset);
  if (!ok) throw new Error('__applyClassicLayerPreset missing');
}

async function readDiagnostics(page: Page) {
  return page.evaluate(() => {
    const diag = (window as unknown as {
      __classicLayerDiagnostics?: { layers?: Array<{ id: string; active: boolean }> };
    }).__classicLayerDiagnostics;
    const stats = (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats;
    const inactive =
      diag?.layers?.filter((l) => !l.active).map((l) => l.id) ??
      (stats?.inactiveLayers as string[] | undefined) ??
      [];
    const active = diag?.layers?.filter((l) => l.active).map((l) => l.id) ?? [];
    return {
      inactive,
      active,
      walls: Number(stats?.walls ?? 0),
      flats: Number(stats?.flats ?? 0),
    };
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

  await page.goto(`${BASE}/?renderer=classic&map=E1M1&_=${Date.now()}`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await waitClassicReady(page);
  await sleep(2000);

  let passed = 0;
  for (const c of CASES) {
    await applyPreset(page, c.preset);
    await sleep(1200);

    const mapState = await page.evaluate(() =>
      document.querySelector('.level-viewer')?.getAttribute('data-map-load-state'),
    );
    if (mapState !== 'ready') {
      throw new Error(`preset ${c.preset} triggered reload — state ${mapState}`);
    }

    const fill = await readFrame(page);
    const diag = await readDiagnostics(page);

    for (const id of c.expectInactive) {
      if (!diag.inactive.includes(id)) {
        throw new Error(
          `[${c.preset}] expected inactive ${id}, got inactive=[${diag.inactive.join(',')}] active=[${diag.active.join(',')}]`,
        );
      }
    }
    if (c.expectActive) {
      for (const id of c.expectActive) {
        if (!diag.active.includes(id)) {
          throw new Error(`[${c.preset}] expected active ${id}, got active=[${diag.active.join(',')}]`);
        }
      }
    }
    if (c.minFill != null && fill < c.minFill) {
      throw new Error(`[${c.preset}] fill ${fill.toFixed(3)} below min ${c.minFill}`);
    }

    console.log(
      `PASS ${c.preset}: fill=${fill.toFixed(3)} walls=${diag.walls} flats=${diag.flats} inactive=${diag.inactive.length}`,
    );
    passed++;
  }

  console.log(`\n=== RESULT: PASS (${passed}/${CASES.length} classic layer presets) ===`);
  await browser.close();
}

main().catch(async (err) => {
  console.error('\n=== RESULT: FAIL ===');
  console.error(err);
  process.exit(1);
});
