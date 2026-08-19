import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const cv = extractGzdoomView(cImg.data, cImg.width, cImg.height);
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const c = resizePlayfieldToVanilla(cv.data, cv.width, cv.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);

const bands = [
  [0, 60, 'L0-60'],
  [60, 80, 'L60-80'],
  [80, 180, 'C80-180'],
  [180, 260, 'C180-260'],
  [260, 320, 'R260-320'],
] as const;

for (const [x0, x1, name] of bands) {
  let m = 0;
  let tot = 0;
  for (let y = 0; y < 42; y++) {
    for (let x = x0; x < x1; x++) {
      tot++;
      const i = (y * 320 + x) * 4;
      const d = Math.max(
        Math.abs(c.data[i]! - g.data[i]!),
        Math.abs(c.data[i + 1]! - g.data[i + 1]!),
        Math.abs(c.data[i + 2]! - g.data[i + 2]!),
      );
      if (d > 8) m++;
    }
  }
  console.log(`${name}: ${((m / tot) * 100).toFixed(1)}% (${m}/${tot})`);
}

const target = '27,27,27|31,23,11';
const xs = new Map<number, number>();
for (let y = 0; y < 42; y++) {
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    const key = `${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}|${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`;
    if (key !== target) continue;
    xs.set(x, (xs.get(x) ?? 0) + 1);
  }
}
console.log('27|31,23,11 top x', [...xs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
