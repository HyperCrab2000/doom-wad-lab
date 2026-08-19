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

const counts = new Map<string, number>();
let mism = 0;
for (let y = 0; y < 42; y++) {
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    const d = Math.max(
      Math.abs(c.data[i]! - g.data[i]!),
      Math.abs(c.data[i + 1]! - g.data[i + 1]!),
      Math.abs(c.data[i + 2]! - g.data[i + 2]!),
    );
    if (d <= 8) continue;
    mism++;
    const key = `g=${g.data[i]},${g.data[i + 1]},${g.data[i + 2]} c=${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
}
console.log('ceiling mism', mism);
for (const [k, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(n, k);
}
