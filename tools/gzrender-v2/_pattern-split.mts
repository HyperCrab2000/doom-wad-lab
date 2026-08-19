import path from 'node:path';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const cImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png'));
const gImg = await loadPng(path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png'));
const cv = extractGzdoomView(cImg.data, cImg.width, cImg.height);
const gv = extractGzdoomView(gImg.data, gImg.width, gImg.height);
const c = resizePlayfieldToVanilla(cv.data, cv.width, cv.height);
const g = resizePlayfieldToVanilla(gv.data, gv.width, gv.height);

function analyze(name: string, y0: number, y1: number, gold: string, classic: string) {
  const pts: Array<{ x: number; y: number }> = [];
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < 320; x++) {
      const i = (y * 320 + x) * 4;
      const d = Math.max(
        Math.abs(c.data[i]! - g.data[i]!),
        Math.abs(c.data[i + 1]! - g.data[i + 1]!),
        Math.abs(c.data[i + 2]! - g.data[i + 2]!),
      );
      if (d <= 8 || d > 16) continue;
      const k = `${g.data[i]},${g.data[i + 1]},${g.data[i + 2]}|${c.data[i]},${c.data[i + 1]},${c.data[i + 2]}`;
      if (k === `${gold}|${classic}`) pts.push({ x, y });
    }
  }
  const left = pts.filter((p) => p.x < 80).length;
  const mid = pts.filter((p) => p.x >= 80 && p.x <= 240).length;
  const right = pts.filter((p) => p.x > 240).length;
  const yBins = new Map<number, number>();
  for (const p of pts) yBins.set(p.y, (yBins.get(p.y) ?? 0) + 1);
  console.log(`\n${name} n=${pts.length} left=${left} mid=${mid} right=${right}`);
  console.log(
    '  y peaks',
    [...yBins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
  );
}

analyze('dark classic', 84, 126, '39,39,39', '27,27,27');
analyze('bright classic', 84, 126, '27,27,27', '39,39,39');
analyze('mid-upper dark', 42, 84, '31,23,11', '20,20,20');
