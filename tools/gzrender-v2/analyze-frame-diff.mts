#!/usr/bin/env tsx
/**
 * Analyze frame diff mismatch distribution.
 */
import path from 'node:path';
import { createCanvas, loadImage } from 'canvas';

import {
  diffRgbaBuffers,
  extractGzdoomView,
  gzdoomViewRegion,
  loadPng,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';

const refPath = process.argv[2] ?? 'artifacts/gzrender-v2/gzdoom/E1M1.png';
const candPath = process.argv[3] ?? 'artifacts/gzrender-v2/wadlab/E1M1.png';

async function main(): Promise<void> {
  const ref = await loadPng(path.resolve(refPath));
  const cand = await loadPng(path.resolve(candPath));
  const refView = extractGzdoomView(ref.data, ref.width, ref.height);
  const candView = extractGzdoomView(cand.data, cand.width, cand.height);
  const refNorm = resizePlayfieldToVanilla(refView.data, refView.width, refView.height);
  const candNorm = resizePlayfieldToVanilla(candView.data, candView.width, candView.height);

  const region = { x: 0, y: 0, width: 320, height: 168 };
  const result = diffRgbaBuffers(
    refNorm.data,
    candNorm.data,
    refNorm.width,
    refNorm.height,
    region,
    0,
  );

  const heat = createCanvas(320, 168);
  const ctx = heat.getContext('2d')!;
  const out = ctx.createImageData(320, 168);

  let match = 0;
  for (let y = 0; y < 168; y++) {
    for (let x = 0; x < 320; x++) {
      const i = (y * 320 + x) * 4;
      const dr = Math.abs(refNorm.data[i]! - candNorm.data[i]!);
      const dg = Math.abs(refNorm.data[i + 1]! - candNorm.data[i + 1]!);
      const db = Math.abs(refNorm.data[i + 2]! - candNorm.data[i + 2]!);
      const delta = Math.max(dr, dg, db);
      if (delta === 0) {
        match++;
        out.data[i] = 0;
        out.data[i + 1] = 80;
        out.data[i + 2] = 0;
      } else if (delta < 16) {
        out.data[i] = 40;
        out.data[i + 1] = 40;
        out.data[i + 2] = 0;
      } else {
        const t = Math.min(255, delta);
        out.data[i] = t;
        out.data[i + 1] = 0;
        out.data[i + 2] = 0;
      }
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  const outPath = path.resolve('artifacts/gzrender-v2/frame-diff-heatmap.png');
  const fs = await import('node:fs');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, heat.toBuffer('image/png'));

  console.log(`mismatch ${(result.mismatchRatio * 100).toFixed(2)}% | matches ${match}/${region.width * region.height}`);
  console.log(`heatmap -> ${outPath}`);

  // Sample bands
  for (const yBand of [20, 60, 100, 140]) {
    let bandMatch = 0;
    for (let x = 0; x < 320; x++) {
      const i = (yBand * 320 + x) * 4;
      const dr = Math.abs(refNorm.data[i]! - candNorm.data[i]!);
      const dg = Math.abs(refNorm.data[i + 1]! - candNorm.data[i + 1]!);
      const db = Math.abs(refNorm.data[i + 2]! - candNorm.data[i + 2]!);
      if (Math.max(dr, dg, db) === 0) bandMatch++;
    }
    console.log(`y=${yBand} exact matches ${bandMatch}/320 (${((bandMatch / 320) * 100).toFixed(1)}%)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
