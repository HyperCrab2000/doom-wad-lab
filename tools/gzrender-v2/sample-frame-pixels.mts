#!/usr/bin/env tsx
/**
 * Sample pixel deltas between GZDoom ref and WAD Lab candidate frames.
 */
import path from 'node:path';
import {
  diffRgbaBuffers,
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';

async function main(): Promise<void> {
  const refPath = path.resolve('artifacts/gzrender-v2/gzdoom/E1M1.png');
  const candPath = path.resolve('artifacts/gzrender-v2/wadlab/E1M1.png');
  const ref = await loadPng(refPath);
  const cand = await loadPng(candPath);
  const refView = extractGzdoomView(ref.data, ref.width, ref.height);
  const candView = extractGzdoomView(cand.data, cand.width, cand.height);
  const refNorm = resizePlayfieldToVanilla(refView.data, refView.width, refView.height);
  const candNorm = resizePlayfieldToVanilla(candView.data, candView.width, candView.height);

  const w = 320;
  const h = 168;
  const result = diffRgbaBuffers(refNorm.data, candNorm.data, w, h, { x: 0, y: 0, width: w, height: h }, 0);
  console.log(`mismatch ${(result.mismatchRatio * 100).toFixed(2)}% meanDelta ${result.meanAbsDelta.toFixed(2)}`);

  const samples: Array<{ x: number; y: number; ref: string; cand: string; delta: number }> = [];
  for (const [x, y] of [
    [160, 84],
    [80, 84],
    [240, 84],
    [160, 40],
    [160, 130],
    [40, 140],
    [280, 140],
  ] as const) {
    const i = (y * w + x) * 4;
    const dr = Math.abs(refNorm.data[i]! - candNorm.data[i]!);
    const dg = Math.abs(refNorm.data[i + 1]! - candNorm.data[i + 1]!);
    const db = Math.abs(refNorm.data[i + 2]! - candNorm.data[i + 2]!);
    samples.push({
      x,
      y,
      ref: `${refNorm.data[i]},${refNorm.data[i + 1]},${refNorm.data[i + 2]}`,
      cand: `${candNorm.data[i]},${candNorm.data[i + 1]},${candNorm.data[i + 2]}`,
      delta: Math.max(dr, dg, db),
    });
  }
  console.log('samples', samples);

  let exactRows = 0;
  for (let y = 0; y < h; y++) {
    let rowExact = true;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (
        refNorm.data[i] !== candNorm.data[i] ||
        refNorm.data[i + 1] !== candNorm.data[i + 1] ||
        refNorm.data[i + 2] !== candNorm.data[i + 2]
      ) {
        rowExact = false;
        break;
      }
    }
    if (rowExact) exactRows++;
  }
  console.log(`exact match rows: ${exactRows}/${h}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
