#!/usr/bin/env tsx
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const refPath = 'artifacts/gzrender-v2/gold-standard/DOOM/E2M8/ref.png';
const candPath = 'artifacts/gzrender-v2/gzdoom-wasm-corpus/DOOM/E2M8/wasm.png';

const ref = await loadPng(refPath);
const cand = await loadPng(candPath);
const refView = extractGzdoomView(ref.data, ref.width, ref.height);
const candView = extractGzdoomView(cand.data, cand.width, cand.height);
const refNorm = resizePlayfieldToVanilla(refView.data, refView.width, refView.height);
const candNorm = resizePlayfieldToVanilla(candView.data, candView.width, candView.height);
const w = 320;
const h = 168;
const byY: Record<number, number> = {};
const byDelta: Record<number, number> = {};
const candColors: Record<string, number> = {};
const refColors: Record<string, number> = {};
let delta8 = 0;
let deltaOther = 0;
const samples: Array<{ x: number; y: number; ref: string; cand: string; delta: number }> = [];

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const dr = Math.abs(refNorm.data[i]! - candNorm.data[i]!);
    const dg = Math.abs(refNorm.data[i + 1]! - candNorm.data[i + 1]!);
    const db = Math.abs(refNorm.data[i + 2]! - candNorm.data[i + 2]!);
    const delta = Math.max(dr, dg, db);
    if (!delta) continue;
    byY[y] = (byY[y] ?? 0) + 1;
    byDelta[delta] = (byDelta[delta] ?? 0) + 1;
    const rc = `${refNorm.data[i]},${refNorm.data[i + 1]},${refNorm.data[i + 2]}`;
    const cc = `${candNorm.data[i]},${candNorm.data[i + 1]},${candNorm.data[i + 2]}`;
    refColors[rc] = (refColors[rc] ?? 0) + 1;
    candColors[cc] = (candColors[cc] ?? 0) + 1;
    if (delta === 8) delta8++;
    else deltaOther++;
    if (y >= 95 && y <= 105 && samples.length < 20) {
      samples.push({ x, y, ref: rc, cand: cc, delta });
    }
  }
}

const total = Object.values(byY).reduce((a, b) => a + b, 0);
let seam = 0;
for (let y = 95; y <= 105; y++) seam += byY[y] ?? 0;

console.log('total mismatches', total);
console.log('delta8 count', delta8, 'other', deltaOther);
console.log(
  'top y bands:',
  Object.entries(byY)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([y, c]) => `y=${y}:${c}`)
    .join(', '),
);
console.log(
  'top deltas:',
  Object.entries(byDelta)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([d, c]) => `d=${d}:${c}`)
    .join(', '),
);
console.log('top cand colors:', Object.entries(candColors).sort((a, b) => b[1] - a[1]).slice(0, 8));
console.log('top ref colors:', Object.entries(refColors).sort((a, b) => b[1] - a[1]).slice(0, 8));
console.log('seam y95-105 count', seam);
console.log('seam samples:', JSON.stringify(samples, null, 2));
