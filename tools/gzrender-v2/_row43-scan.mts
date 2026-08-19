import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const g = resizePlayfieldToVanilla(
  extractGzdoomView(gImg.data, gImg.width, gImg.height).data,
  extractGzdoomView(gImg.data, gImg.width, gImg.height).width,
  extractGzdoomView(gImg.data, gImg.width, gImg.height).height,
);
const c = resizePlayfieldToVanilla(
  extractGzdoomView(cImg.data, cImg.width, cImg.height).data,
  extractGzdoomView(cImg.data, cImg.width, cImg.height).width,
  extractGzdoomView(cImg.data, cImg.width, cImg.height).height,
);

for (const y of [42, 43, 44, 45]) {
  const parts: string[] = [];
  for (let x = 60; x <= 95; x++) {
    const i = (y * 320 + x) * 4;
    const gr = g.data[i]!;
    parts.push(`${x}:${gr}`);
  }
  console.log(`y${y} gold`, parts.join(' '));
}
for (const y of [42, 43, 44]) {
  const parts: string[] = [];
  for (let x = 60; x <= 95; x++) {
    const i = (y * 320 + x) * 4;
    parts.push(`${x}:${c.data[i]}`);
  }
  console.log(`y${y} classic`, parts.join(' '));
}

for (let y = 84; y < 126; y += 10) {
  let mism27 = 0;
  let tot = 0;
  for (let x = 220; x < 260; x++) {
    tot++;
    const i = (y * 320 + x) * 4;
    if (c.data[i] === 27 && c.data[i + 1] === 27 && c.data[i + 2] === 27) mism27++;
  }
  console.log(`y${y} x220-259 classic=27 count ${mism27}/${tot}`);
}
