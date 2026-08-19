#!/usr/bin/env tsx
/** Sample structural (d>24) pixels in mid-upper bucket. */
import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const cView = extractGzdoomView(cImg.data, cImg.width, cImg.height);
const gView = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const c = resizePlayfieldToVanilla(cView.data, cView.width, cView.height);
const g = resizePlayfieldToVanilla(gView.data, gView.width, gView.height);

const samples: string[] = [];
for (let y = 42; y < 84; y++) {
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    const d = Math.max(Math.abs(c.data[i]! - g.data[i]!), Math.abs(c.data[i + 1]! - g.data[i + 1]!), Math.abs(c.data[i + 2]! - g.data[i + 2]!));
    if (d <= 24) continue;
    samples.push(`(${x},${y}) d=${d} gold=${g.data[i]},${g.data[i + 1]},${g.data[i + 2]} classic=${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`);
    if (samples.length >= 25) break;
  }
  if (samples.length >= 25) break;
}
console.log('structural samples', samples.length);
for (const s of samples) console.log(s);
