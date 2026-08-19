#!/usr/bin/env tsx
import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const gView = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const g = resizePlayfieldToVanilla(gView.data, gView.width, gView.height);

for (const y of [42, 43, 44, 45, 46, 50, 55]) {
  const parts: string[] = [];
  for (let x = 80; x <= 120; x++) {
    const i = (y * 320 + x) * 4;
    const r = g.data[i]!;
    const isSky = r <= 31 && g.data[i + 1]! <= 31 && g.data[i + 2]! <= 31;
    parts.push(isSky ? '.' : '#');
  }
  console.log(`y${y}: ${parts.join('')}`);
}
console.log('(.=sky-ish #=wall-ish)');
console.log('---');
for (let x = 60; x <= 79; x++) {
  const i = (44 * 320 + x) * 4;
  console.log(`y44 x=${x}: ${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}`);
}
console.log('---');
for (const x of [48, 60, 69, 80, 100, 150, 200, 250]) {
  const row: string[] = [];
  for (let y = 42; y <= 57; y++) {
    const i = (y * 320 + x) * 4;
    row.push(`${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}`);
  }
  console.log(`x=${x} y42-57: ${row.join(' | ')}`);
}
