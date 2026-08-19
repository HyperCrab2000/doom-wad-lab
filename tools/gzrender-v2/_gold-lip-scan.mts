import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const g = resizePlayfieldToVanilla(
  extractGzdoomView(gImg.data, gImg.width, gImg.height).data,
  extractGzdoomView(gImg.data, gImg.width, gImg.height).width,
  extractGzdoomView(gImg.data, gImg.width, gImg.height).height,
);
function px(x: number, y: number) {
  const i = (y * 320 + x) * 4;
  return `${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}`;
}
for (const [x, y] of [
  [58, 52], [59, 52], [60, 52], [61, 52], [62, 52],
  [63, 55], [64, 55], [65, 55],
]) {
  console.log(`(${x},${y}) gold=${px(x, y)}`);
}
