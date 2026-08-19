#!/usr/bin/env tsx
import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);

const rows = [49, 50, 51, 52];
const x0 = 42;
const x1 = 108;
const entries: string[] = [];
for (const y of rows) {
  for (let x = x0; x < x1; x++) {
    const i = (y * 320 + x) * 4;
    entries.push(`  [${y}, ${x}, ${g.data[i]}, ${g.data[i + 1]}, ${g.data[i + 2]}],`);
  }
}
console.log('export const E1M1_SPAWN_HANGAR_LIP_GOLD: ReadonlyArray<readonly [number, number, number, number, number]> = [');
console.log(entries.join('\n'));
console.log('];');
