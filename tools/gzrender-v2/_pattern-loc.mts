import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const cv = extractGzdoomView(cImg.data, cImg.width, cImg.height);
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const c = resizePlayfieldToVanilla(cv.data, cv.width, cv.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);

const target = '39,39,39|27,27,27';
const xs = new Map<number, number>();
const ys = new Map<number, number>();
let n = 0;
for (let y = 84; y < 126; y++) {
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    const key = `${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}|${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`;
    if (key !== target) continue;
    const d = Math.max(
      Math.abs(c.data[i]! - g.data[i]!),
      Math.abs(c.data[i + 1]! - g.data[i + 1]!),
      Math.abs(c.data[i + 2]! - g.data[i + 2]!),
    );
    if (d <= 8 || d > 16) continue;
    n++;
    xs.set(x, (xs.get(x) ?? 0) + 1);
    ys.set(y, (ys.get(y) ?? 0) + 1);
  }
}
console.log('pattern count', n);
console.log('top x', [...xs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
console.log('top y', [...ys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
