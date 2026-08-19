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
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);

const byDelta = new Map<number, number>();
for (let y = 84; y < 126; y++) {
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    const d = Math.max(
      Math.abs(c.data[i]! - g.data[i]!),
      Math.abs(c.data[i + 1]! - g.data[i + 1]!),
      Math.abs(c.data[i + 2]! - g.data[i + 2]!),
    );
    if (d <= 8) continue;
    byDelta.set(d, (byDelta.get(d) ?? 0) + 1);
  }
}
console.log('need flip', Math.max(0, [...byDelta.values()].reduce((a, b) => a + b, 0) - Math.floor(13440 * 0.7)));
for (const [d, n] of [...byDelta.entries()].sort((a, b) => a[0] - b[0]).slice(0, 8)) {
  console.log(`d=${d}: ${n}`);
}
