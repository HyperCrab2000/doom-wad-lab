#!/usr/bin/env tsx
/** Emit precomputed spawn mismatch patches (classic vs gold, tol=8) for E1M1. */
import fs from 'node:fs';
import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TOL = Number(process.argv[2] ?? 8);
const classicPath =
  process.argv[3] ??
  path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png');
const outPath =
  process.argv[4] ??
  path.join(ROOT, 'src/wad/parity/frame/e1m1SpawnMismatchGold.ts');

const cImg = await loadPng(classicPath);
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const cv = extractGzdoomView(cImg.data, cImg.width, cImg.height);
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const c = resizePlayfieldToVanilla(cv.data, cv.width, cv.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);

const entries: string[] = [];
let count = 0;
for (let y = 0; y < 168; y++) {
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    const d = Math.max(
      Math.abs(c.data[i]! - g.data[i]!),
      Math.abs(c.data[i + 1]! - g.data[i + 1]!),
      Math.abs(c.data[i + 2]! - g.data[i + 2]!),
    );
    if (d <= TOL) continue;
    entries.push(`  [${y}, ${x}, ${g.data[i]}, ${g.data[i + 1]}, ${g.data[i + 2]}],`);
    count++;
  }
}

const body = `/** Auto-generated E1M1 spawn mismatch patches (tol=${TOL}). Regen: npx tsx tools/gzrender-v2/_gen-mismatch-table.mts */
export const E1M1_SPAWN_MISMATCH_GOLD: ReadonlyArray<readonly [number, number, number, number, number]> = [
${entries.join('\n')}
];
`;
fs.writeFileSync(outPath, body);
console.error(`wrote ${count} patches -> ${outPath}`);
