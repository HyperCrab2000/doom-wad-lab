#!/usr/bin/env npx tsx
import path from 'node:path';
import {
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';

const leftPath = path.resolve(process.argv[2] ?? 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png');
const rightPath = path.resolve(process.argv[3] ?? 'artifacts/gzrender-v2/gzdoom-wasm/E1M1.png');

async function norm(p: string) {
  const img = await loadPng(p);
  const view = extractGzdoomView(img.data, img.width, img.height);
  return resizePlayfieldToVanilla(view.data, view.width, view.height);
}

const left = await norm(leftPath);
const right = await norm(rightPath);
const w = 320;
const h = 168;
const mismatches: Array<{ x: number; y: number; d: number; gold: number[]; wasm: number[] }> = [];

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const d = Math.max(
      Math.abs(left.data[i]! - right.data[i]!),
      Math.abs(left.data[i + 1]! - right.data[i + 1]!),
      Math.abs(left.data[i + 2]! - right.data[i + 2]!),
    );
    if (d > 0) {
      mismatches.push({
        x,
        y,
        d,
        gold: [left.data[i]!, left.data[i + 1]!, left.data[i + 2]!],
        wasm: [right.data[i]!, right.data[i + 1]!, right.data[i + 2]!],
      });
    }
  }
}

console.log(`mismatches: ${mismatches.length}`);
const xs = [...new Set(mismatches.map((m) => m.x))].sort((a, b) => a - b);
console.log(`unique x columns: ${xs.join(', ')}`);
for (const m of mismatches.slice(0, 24)) {
  console.log(`  (${m.x},${m.y}) delta=${m.d} gold=${m.gold.join(',')} wasm=${m.wasm.join(',')}`);
}
