#!/usr/bin/env tsx
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const cImg = await loadPng('artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png');
const gImg = await loadPng('artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png');
const cView = extractGzdoomView(cImg.data, cImg.width, cImg.height);
const gView = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const c = resizePlayfieldToVanilla(cView.data, cView.width, cView.height);
const g = resizePlayfieldToVanilla(gView.data, gView.width, gView.height);
for (const [x, y] of [[69, 44], [108, 44], [85, 44], [64, 55]] as const) {
  const i = (y * 320 + x) * 4;
  console.log(
    `(${x},${y}) classic=${c.data[i]},${c.data[i + 1]},${c.data[i + 2]} gold=${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}`,
  );
}
