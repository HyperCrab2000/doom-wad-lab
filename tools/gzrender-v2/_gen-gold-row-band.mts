#!/usr/bin/env tsx
import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);

const name = process.argv[2] ?? 'E1M1_SPAWN_MIDLOWER_ROW92_94_EAST';
const rows = (process.argv[3] ?? '92,93,94').split(',').map(Number);
const x0 = Number(process.argv[4] ?? 218);
const x1 = Number(process.argv[5] ?? 320);
const entries: string[] = [];
for (const y of rows) {
  for (let x = x0; x < x1; x++) {
    const i = (y * 320 + x) * 4;
    entries.push(`  [${y}, ${x}, ${g.data[i]}, ${g.data[i + 1]}, ${g.data[i + 2]}],`);
  }
}
console.log(`export const ${name}: ReadonlyArray<readonly [number, number, number, number, number]> = [`);
console.log(entries.join('\n'));
console.log('];');
