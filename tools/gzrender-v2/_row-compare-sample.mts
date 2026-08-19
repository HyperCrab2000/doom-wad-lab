#!/usr/bin/env tsx
import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const cv = extractGzdoomView(cImg.data, cImg.width, cImg.height);
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const c = resizePlayfieldToVanilla(cv.data, cv.width, cv.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);
const y = Number(process.argv[2] ?? 94);
const x0 = Number(process.argv[3] ?? 150);
const x1 = Number(process.argv[4] ?? 170);
for (let x = x0; x < x1; x++) {
  const i = (y * 320 + x) * 4;
  console.log(
    `x=${x} gold=${g.data[i]},${g.data[i + 1]},${g.data[i + 2]} classic=${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`,
  );
}
