import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const c = resizePlayfieldToVanilla(
  extractGzdoomView(cImg.data, cImg.width, cImg.height).data,
  extractGzdoomView(cImg.data, cImg.width, cImg.height).width,
  extractGzdoomView(cImg.data, cImg.width, cImg.height).height,
);
const g = resizePlayfieldToVanilla(
  extractGzdoomView(gImg.data, gImg.width, gImg.height).data,
  extractGzdoomView(gImg.data, gImg.width, gImg.height).width,
  extractGzdoomView(gImg.data, gImg.width, gImg.height).height,
);

const target = '47,47,47|19,19,19';
const xs = new Map<number, number>();
for (let y = 84; y < 126; y++) {
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    const key = `${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}|${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`;
    if (key !== target) continue;
    xs.set(x, (xs.get(x) ?? 0) + 1);
  }
}
console.log('47|19 count', [...xs.values()].reduce((a, b) => a + b, 0));
console.log('top x', [...xs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));

const target2 = '47,47,47|67,67,67';
let n2 = 0;
for (let y = 84; y < 126; y++) {
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    const key = `${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}|${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`;
    if (key === target2) n2++;
  }
}
console.log('47|67 (classic brighter) count', n2);

for (const [x, y] of [
  [160, 100],
  [80, 100],
  [240, 100],
  [280, 100],
]) {
  const i = (y * 320 + x) * 4;
  console.log(`(${x},${y}) gold=${g.data[i]},${g.data[i + 1]},${g.data[i + 2]} classic=${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`);
}
