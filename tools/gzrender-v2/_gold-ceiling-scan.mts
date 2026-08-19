import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);

function isSkyGray(i: number): boolean {
  const r = g.data[i]!;
  const gr = g.data[i + 1]!;
  const b = g.data[i + 2]!;
  return r <= 35 && gr <= 35 && b <= 35 && Math.max(r, gr, b) - Math.min(r, gr, b) <= 8;
}

for (const y of [5, 20, 30, 40, 41]) {
  let line = `y${y}: `;
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    line += isSkyGray(i) ? '.' : '#';
  }
  console.log(line);
}
console.log('(.=sky-ish gray #=wall/color)');

for (const y of [5, 20, 30]) {
  const sky: number[] = [];
  const wall: number[] = [];
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    (isSkyGray(i) ? sky : wall).push(x);
  }
  console.log(`y${y} sky x ranges: first=${sky.slice(0, 5).join(',')} ... last=${sky.slice(-5).join(',')} count=${sky.length}`);
}
