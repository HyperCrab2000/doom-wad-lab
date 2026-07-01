#!/usr/bin/env npx tsx
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const x = Number(process.argv[2] ?? 62);
const y = Number(process.argv[3] ?? 49);

for (const p of process.argv.slice(4)) {
  const img = await loadPng(p);
  const view = extractGzdoomView(img.data, img.width, img.height);
  const norm = resizePlayfieldToVanilla(view.data, view.width, view.height);
  const i = (y * 320 + x) * 4;
  console.log(`${p}: rgb=${norm.data[i]},${norm.data[i + 1]},${norm.data[i + 2]}`);
}
