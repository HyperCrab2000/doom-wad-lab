#!/usr/bin/env tsx
/**
 * Divide-and-conquer: sweep Classic modular stage caps vs gold at E1M1 spawn.
 *
 * Shows which draw stages contribute how much mismatch vs ref.png.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/compare-classic-parity-layers.mts [MAP]
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { diffPlayfieldPngFiles } from '../../src/wad/parity/frame/frameDiff.ts';
import {
  MODULAR_STAGE_ORDER,
  type ModularRenderStage,
} from '../../src/wad/renderer/modular/modularRenderStage.ts';
import { waitClassicPlaying } from './waitClassicPlaying.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.BASE_URL ?? 'http://localhost:5150';
const MAP = process.argv[2] ?? 'E1M1';
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM', MAP, 'ref.png');

const STAGE_CAPS: ModularRenderStage[] = [
  'flats',
  'wallsOpaque',
  'wallsTransparent',
  'sprites',
];

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

async function captureClassic(
  page: puppeteer.Page,
  modStage: ModularRenderStage | null,
): Promise<{ png: Buffer; stats: Record<string, number> }> {
  const params = new URLSearchParams({
    renderer: 'classic',
    frameParity: '1',
    map: MAP,
    _: String(Date.now()),
  });
  if (modStage) params.set('modStage', modStage);

  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
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
  if (!dataUrl) throw new Error('Classic capture failed');
  const stats = await page.evaluate(() => {
    const raw = (window as { __doomDrawStats?: Record<string, number> }).__doomDrawStats ?? {};
    return {
      walls: Number(raw.walls ?? 0),
      flats: Number(raw.flats ?? 0),
      sprites: Number(raw.sprites ?? 0),
    };
  });
  return {
    png: Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'),
    stats,
  };
}

async function main(): Promise<void> {
  if (!fs.existsSync(GOLD)) {
    throw new Error(`Missing gold ref: ${GOLD}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });

  const rows: Array<{
    stage: string;
    mismatchPct: number;
    walls: number;
    flats: number;
    sprites: number;
  }> = [];

  try {
    const page = await browser.newPage();
    await forcePreserveDrawingBuffer(page);

    // Full pipeline (no modStage cap)
    {
      const { png, stats } = await captureClassic(page, null);
      const out = path.join(OUT_DIR, `${MAP}-classic-stage-full.png`);
      fs.writeFileSync(out, png);
      const diff = await diffPlayfieldPngFiles(out, GOLD, { tolerance: 8, layout: 'gzdoom-view' });
      rows.push({
        stage: 'full (all stages)',
        mismatchPct: diff.mismatchRatio * 100,
        walls: stats.walls,
        flats: stats.flats,
        sprites: stats.sprites,
      });
    }

    for (const cap of STAGE_CAPS) {
      const { png, stats } = await captureClassic(page, cap);
      const out = path.join(OUT_DIR, `${MAP}-classic-stage-${cap}.png`);
      fs.writeFileSync(out, png);
      const diff = await diffPlayfieldPngFiles(out, GOLD, { tolerance: 8, layout: 'gzdoom-view' });
      rows.push({
        stage: `cap=${cap}`,
        mismatchPct: diff.mismatchRatio * 100,
        walls: stats.walls,
        flats: stats.flats,
        sprites: stats.sprites,
      });
    }
  } finally {
    await browser.close();
  }

  console.log(`\nClassic stage ladder vs gold (${MAP} spawn, frameParity=1)\n`);
  console.log('| Stage cap | Mismatch % | walls | flats | sprites |');
  console.log('|-----------|------------|-------|-------|---------|');
  for (const row of rows) {
    console.log(
      `| ${row.stage.padEnd(20)} | ${row.mismatchPct.toFixed(2).padStart(8)}% | ${String(row.walls).padStart(5)} | ${String(row.flats).padStart(5)} | ${String(row.sprites).padStart(7)} |`,
    );
  }

  const full = rows[0]!;
  const best = rows.reduce((a, b) => (a.mismatchPct < b.mismatchPct ? a : b));
  console.log(`\nFull pipeline: ${full.mismatchPct.toFixed(2)}%`);
  console.log(`Lowest mismatch in ladder: ${best.stage} @ ${best.mismatchPct.toFixed(2)}%`);
  console.log(`\nStage order: ${MODULAR_STAGE_ORDER.join(' → ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
