#!/usr/bin/env tsx
import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const cView = extractGzdoomView(cImg.data, cImg.width, cImg.height);
const gView = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const c = resizePlayfieldToVanilla(cView.data, cView.width, cView.height);
const g = resizePlayfieldToVanilla(gView.data, gView.width, gView.height);

const tol = 8;
const rows: { y: number; pct: number; n: number }[] = [];
for (let y = 0; y < 168; y++) {
  let bad = 0;
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    const d = Math.max(
      Math.abs(c.data[i]! - g.data[i]!),
      Math.abs(c.data[i + 1]! - g.data[i + 1]!),
      Math.abs(c.data[i + 2]! - g.data[i + 2]!),
    );
    if (d > tol) bad++;
  }
  rows.push({ y, pct: (bad / 320) * 100, n: bad });
}
rows.sort((a, b) => b.pct - a.pct);
console.log('worst rows (tol=8):');
for (const r of rows.slice(0, 20)) {
  console.log(` y=${r.y} ${r.pct.toFixed(1)}% (${r.n}/320)`);
}
