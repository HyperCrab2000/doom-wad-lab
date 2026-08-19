import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const g = resizePlayfieldToVanilla(
  extractGzdoomView(gImg.data, gImg.width, gImg.height).data,
  extractGzdoomView(gImg.data, gImg.width, gImg.height).width,
  extractGzdoomView(gImg.data, gImg.width, gImg.height).height,
);

for (const y of [95, 100, 105, 110]) {
  let line = `y${y}: `;
  for (let x = 200; x < 280; x++) {
    const i = (y * 320 + x) * 4;
    const r = g.data[i]!;
    const isWall = r < 40 && g.data[i + 2]! < 40 && r !== g.data[i + 1]!; // brownish
    const isFlat = r === g.data[i + 1]! && g.data[i + 1]! === g.data[i + 2]!;
    line += isFlat ? (r >= 40 ? 'F' : 'f') : isWall ? 'W' : '#';
  }
  console.log(line);
}
console.log('F=floor flat bright f=floor flat dark W=wall brown #=other');

for (let x = 200; x < 280; x++) {
  const i = (100 * 320 + x) * 4;
  if (x % 10 === 0) console.log(`x${x}: ${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}`);
}
