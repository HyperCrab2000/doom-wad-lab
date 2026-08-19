#!/usr/bin/env tsx
/** Dump gold ref playfield colors for E1M1 spawn lip bands. */
import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const gView = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const g = resizePlayfieldToVanilla(gView.data, gView.width, gView.height);

for (let y = 44; y < 53; y++) {
  const row: string[] = [];
  for (let x = 85; x < 145; x++) {
    const i = (y * 320 + x) * 4;
    row.push(`${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}`);
  }
  console.log(`y=${y}`, row.join(' | '));
}
