import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const cv = extractGzdoomView(cImg.data, cImg.width, cImg.height);
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const c = resizePlayfieldToVanilla(cv.data, cv.width, cv.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);

for (const y of [84, 85, 94]) {
  let mism = 0;
  const pats = new Map<string, number>();
  for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    const d = Math.max(
      Math.abs(c.data[i]! - g.data[i]!),
      Math.abs(c.data[i + 1]! - g.data[i + 1]!),
      Math.abs(c.data[i + 2]! - g.data[i + 2]!),
    );
    if (d <= 8) continue;
    mism++;
    if (d <= 16) {
      const key = `d${d} g=${g.data[i]},${g.data[i + 1]},${g.data[i + 2]} c=${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`;
      pats.set(key, (pats.get(key) ?? 0) + 1);
    }
  }
  console.log(`y=${y} mism ${mism}`);
  for (const [k, n] of [...pats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
    console.log(`  ${n} ${k}`);
  }
}
