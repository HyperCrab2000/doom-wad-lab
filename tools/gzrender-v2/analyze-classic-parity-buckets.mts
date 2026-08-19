#!/usr/bin/env tsx
/**
 * Divide-and-conquer: attribute Classic vs gold mismatch by screen region and delta class.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/analyze-classic-parity-buckets.mts [classicPng] [goldPng]
 *
 * Defaults to latest E1M1 parity-compare captures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from 'canvas';

import {
  diffRgbaBuffers,
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare');

const classicPath =
  process.argv[2] ?? path.join(OUT, 'E1M1-classic-spawn.png');
const goldPath =
  process.argv[3] ?? path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png');

const W = 320;
const H = 168;

/** Screen bands (Doom playfield Y-down, 320×168). */
const REGIONS: Array<{ id: string; y0: number; y1: number; note: string }> = [
  { id: 'ceiling', y0: 0, y1: 42, note: 'Top quarter — ceiling / upper wall' },
  { id: 'mid-upper', y0: 42, y1: 84, note: 'Eye line / mid walls' },
  { id: 'mid-lower', y0: 84, y1: 126, note: 'Floor transition / nukage band' },
  { id: 'floor', y0: 126, y1: 168, note: 'Lower floor / weapon lip' },
];

type DeltaClass = 'exact' | 'colormap' | 'moderate' | 'structural';

function classifyDelta(delta: number): DeltaClass {
  if (delta === 0) return 'exact';
  if (delta <= 24) return 'colormap';
  if (delta <= 63) return 'moderate';
  return 'structural';
}

async function loadPlayfield(pngPath: string) {
  const img = await loadPng(path.resolve(pngPath));
  const view = extractGzdoomView(img.data, img.width, img.height);
  return resizePlayfieldToVanilla(view.data, view.width, view.height);
}

async function main(): Promise<void> {
  const classic = await loadPlayfield(classicPath);
  const gold = await loadPlayfield(goldPath);

  const full = diffRgbaBuffers(classic.data, gold.data, W, H, { x: 0, y: 0, width: W, height: H }, 8);
  console.log(`Classic: ${classicPath}`);
  console.log(`Gold:    ${goldPath}`);
  console.log(`Full playfield (tol=8): ${(full.mismatchRatio * 100).toFixed(2)}% mismatch (${full.mismatchedPixels}/${full.comparedPixels} px)`);
  console.log(`meanAbsDelta=${full.meanAbsDelta.toFixed(2)} maxChannelDelta=${full.maxChannelDelta}\n`);

  console.log('| Region | Y range | Mismatch % | Colormap-ish | Structural | Notes |');
  console.log('|--------|---------|------------|--------------|------------|-------|');

  for (const region of REGIONS) {
    let compared = 0;
    let mismatched = 0;
    let colormapish = 0;
    let structural = 0;

    for (let y = region.y0; y < region.y1; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const dr = Math.abs(classic.data[i]! - gold.data[i]!);
        const dg = Math.abs(classic.data[i + 1]! - gold.data[i + 1]!);
        const db = Math.abs(classic.data[i + 2]! - gold.data[i + 2]!);
        const delta = Math.max(dr, dg, db);
        compared++;
        if (delta <= 8) continue;
        mismatched++;
        const cls = classifyDelta(delta);
        if (cls === 'colormap' || cls === 'moderate') colormapish++;
        if (cls === 'structural') structural++;
      }
    }

    const pct = compared ? (mismatched / compared) * 100 : 0;
    console.log(
      `| ${region.id} | ${region.y0}–${region.y1} | ${pct.toFixed(1)}% | ${colormapish} px | ${structural} px | ${region.note} |`,
    );
  }

  // Heatmap
  const heat = createCanvas(W, H);
  const ctx = heat.getContext('2d')!;
  const out = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dr = Math.abs(classic.data[i]! - gold.data[i]!);
      const dg = Math.abs(classic.data[i + 1]! - gold.data[i + 1]!);
      const db = Math.abs(classic.data[i + 2]! - gold.data[i + 2]!);
      const delta = Math.max(dr, dg, db);
      const cls = classifyDelta(delta);
      if (cls === 'exact') {
        out.data[i] = 0;
        out.data[i + 1] = 96;
        out.data[i + 2] = 0;
      } else if (cls === 'colormap' || cls === 'moderate') {
        out.data[i] = 220;
        out.data[i + 1] = 180;
        out.data[i + 2] = 0;
      } else {
        out.data[i] = 255;
        out.data[i + 1] = 40;
        out.data[i + 2] = 40;
      }
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const heatPath = path.join(OUT, 'E1M1-parity-buckets-heatmap.png');
  fs.mkdirSync(path.dirname(heatPath), { recursive: true });
  fs.writeFileSync(heatPath, heat.toBuffer('image/png'));
  console.log(`\nHeatmap: ${heatPath}`);
  console.log('  green = match, yellow = colormap/lighting, red = structural (>63 delta)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
