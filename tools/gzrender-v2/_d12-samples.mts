import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const cv = extractGzdoomView(cImg.data, cImg.width, cImg.height);
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const c = resizePlayfieldToVanilla(cv.data, cv.width, cv.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);

const samples: Array<{ x: number; y: number; d: number; g: string; c: string }> = [];
for (let y = 84; y < 126; y++) {
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    const d = Math.max(
      Math.abs(c.data[i]! - g.data[i]!),
      Math.abs(c.data[i + 1]! - g.data[i + 1]!),
      Math.abs(c.data[i + 2]! - g.data[i + 2]!),
    );
    if (d !== 12) continue;
    samples.push({
      x,
      y,
      d,
      g: `${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}`,
      c: `${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`,
    });
  }
}
console.log('d=12 count', samples.length);
const byKey = new Map<string, typeof samples>();
for (const s of samples) {
  const k = `${s.g}|${s.c}`;
  const arr = byKey.get(k) ?? [];
  arr.push(s);
  byKey.set(k, arr);
}
for (const [k, arr] of [...byKey.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5)) {
  console.log('\n', arr.length, k);
  const xs = new Map<number, number>();
  for (const s of arr) xs.set(s.x, (xs.get(s.x) ?? 0) + 1);
  console.log('  x peaks', [...xs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));
  for (const s of arr.slice(0, 3)) console.log('  ', s.x, s.y);
}
