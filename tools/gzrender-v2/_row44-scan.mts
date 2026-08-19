#!/usr/bin/env tsx
import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const c = resizePlayfieldToVanilla(extractGzdoomView(cImg.data, cImg.width, cImg.height).data, 320, 168);
const g = resizePlayfieldToVanilla(extractGzdoomView(gImg.data, gImg.width, gImg.height).data, 320, 168);
const y0 = Number(process.argv[2] ?? 44);
const y1 = Number(process.argv[3] ?? y0 + 1);
for (let y = y0; y < y1; y++) {
  console.log('--- y=' + y + ' ---');
  for (let x = 85; x < 145; x++) {
    const i = (y * 320 + x) * 4;
    const ci = i;
    const d = Math.max(
      Math.abs(c.data[ci]! - g.data[ci]!),
      Math.abs(c.data[ci + 1]! - g.data[ci + 1]!),
      Math.abs(c.data[ci + 2]! - g.data[ci + 2]!),
    );
    if (d <= 8) continue;
    console.log(
      `x=${x} gold=${g.data[ci]},${g.data[ci + 1]},${g.data[ci + 2]} classic=${c.data[ci]},${c.data[ci + 1]},${c.data[ci + 2]} d=${d}`,
    );
  }
}
