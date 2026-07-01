#!/usr/bin/env tsx
import path from 'node:path';
import {
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';

async function main(): Promise<void> {
  const refPath = path.resolve(process.argv[2] ?? 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png');
  const candPath = path.resolve(process.argv[3] ?? 'artifacts/gzrender-v2/gzdoom-wasm/E1M1.png');
  const ref = await loadPng(refPath);
  const cand = await loadPng(candPath);
  const refView = extractGzdoomView(ref.data, ref.width, ref.height);
  const candView = extractGzdoomView(cand.data, cand.width, cand.height);
  const refNorm = resizePlayfieldToVanilla(refView.data, refView.width, refView.height);
  const candNorm = resizePlayfieldToVanilla(candView.data, candView.width, candView.height);
  const w = 320;
  const h = 168;
  const mismatches: Array<{ x: number; y: number; ref: string; cand: string; delta: number }> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dr = Math.abs(refNorm.data[i]! - candNorm.data[i]!);
      const dg = Math.abs(refNorm.data[i + 1]! - candNorm.data[i + 1]!);
      const db = Math.abs(refNorm.data[i + 2]! - candNorm.data[i + 2]!);
      const delta = Math.max(dr, dg, db);
      if (delta > 0) {
        mismatches.push({
          x,
          y,
          ref: `${refNorm.data[i]},${refNorm.data[i + 1]},${refNorm.data[i + 2]}`,
          cand: `${candNorm.data[i]},${candNorm.data[i + 1]},${candNorm.data[i + 2]}`,
          delta,
        });
      }
    }
  }
  console.log(`mismatches: ${mismatches.length}`);
  console.log(JSON.stringify(mismatches, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
