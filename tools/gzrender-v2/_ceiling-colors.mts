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

function px(data: Uint8ClampedArray, x: number, y: number) {
  const i = (y * 320 + x) * 4;
  return `${data[i]},${data[i + 1]},${data[i + 2]}`;
}

for (const x of [160, 240, 270]) {
  for (const y of [5, 20, 30, 41]) {
    console.log(`x=${x} y=${y} gold=${px(g.data, x, y)} classic=${px(c.data, x, y)}`);
  }
}
