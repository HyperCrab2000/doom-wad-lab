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

for (const y of [130, 140, 150]) {
  let c27 = 0;
  let g47 = 0;
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    if (c.data[i] === 27 && c.data[i + 1] === 27 && c.data[i + 2] === 27) c27++;
    if (g.data[i] === 47 && g.data[i + 1] === 47 && g.data[i + 2] === 47) g47++;
  }
  console.log(`y${y}: classic27=${c27} gold47=${g47}`);
}

for (const x of [80, 88, 109, 160, 240]) {
  const i = (44 * 320 + x) * 4;
  console.log(`y44 x${x} gold=${g.data[i]},${g.data[i + 1]},${g.data[i + 2]} classic=${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`);
}
