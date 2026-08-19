#!/usr/bin/env tsx
/** Top mismatch patterns per bucket vs gold (tol=8). */
import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const cv = extractGzdoomView(cImg.data, cImg.width, cImg.height);
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const c = resizePlayfieldToVanilla(cv.data, cv.width, cv.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);

const bands = [
  ['mid-upper', 42, 84],
  ['mid-lower', 84, 126],
  ['floor', 126, 168],
] as const;

for (const [name, y0, y1] of bands) {
  const patterns = new Map<string, number>();
  let mism = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < 320; x++) {
      const i = (y * 320 + x) * 4;
      const d = Math.max(
        Math.abs(c.data[i]! - g.data[i]!),
        Math.abs(c.data[i + 1]! - g.data[i + 1]!),
        Math.abs(c.data[i + 2]! - g.data[i + 2]!),
      );
      if (d <= 8) continue;
      mism++;
      const key = `${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}|${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`;
      patterns.set(key, (patterns.get(key) ?? 0) + 1);
    }
  }
  console.log(`\n${name} mism=${mism} (${((mism / ((y1 - y0) * 320)) * 100).toFixed(1)}%)`);
  for (const [k, n] of [...patterns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`  ${n} gold|classic ${k}`);
  }
}
