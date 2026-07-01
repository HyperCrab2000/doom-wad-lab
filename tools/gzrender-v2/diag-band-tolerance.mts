#!/usr/bin/env npx tsx
/**
 * Measure colormap-band-exact parity: a diff pixel is a TRUE mismatch only if the WASM color
 * matches NO native pixel within its 3x3 neighborhood (i.e. it is not merely a 1-colormap-row /
 * 1-pixel fade-boundary shift). Reports strict diff vs band-tolerant residual per map + corpus.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  loadPng,
  extractGzdoomView,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const WASM = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm-corpus');
const REPORT = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm-corpus-report.json');

const report = JSON.parse(fs.readFileSync(REPORT, 'utf8')) as Record<
  string,
  { slug: string; results: Array<{ map: string; tier: string }> }
>;

async function norm(p: string) {
  const { data, width, height } = await loadPng(p);
  const v = extractGzdoomView(data, width, height);
  return resizePlayfieldToVanilla(v.data, v.width, v.height);
}

// WASM pixel matches some native pixel within radius r (exact RGB) → boundary/band shift, forgiven.
function matchesNeighborhood(
  wasm: Uint8ClampedArray, nat: Uint8ClampedArray, W: number, H: number,
  x: number, y: number, r: number,
): boolean {
  const i = (y * W + x) * 4;
  const wr = wasm[i]!, wg = wasm[i + 1]!, wb = wasm[i + 2]!;
  for (let dy = -r; dy <= r; dy++) {
    const ny = y + dy; if (ny < 0 || ny >= H) continue;
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx; if (nx < 0 || nx >= W) continue;
      const j = (ny * W + nx) * 4;
      if (nat[j] === wr && nat[j + 1] === wg && nat[j + 2] === wb) return true;
    }
  }
  return false;
}

let corpusStrict = 0, corpusResidual = 0, corpusRes2 = 0, corpusRes3 = 0, mapsClean = 0, mapsTotal = 0;
let worstMap = '', worstResidual = 0;
const lines: string[] = [];

for (const [slug, sec] of Object.entries(report)) {
  for (const r of sec.results) {
    const nativePath = path.join(GOLD, slug, r.map, 'ref.png');
    const wasmPath = path.join(WASM, slug, r.map, 'wasm.png');
    if (!fs.existsSync(nativePath) || !fs.existsSync(wasmPath)) continue;
    mapsTotal++;
    const a = await norm(nativePath);
    const b = await norm(wasmPath);
    const W = a.width, H = a.height;
    let strict = 0, res1 = 0, res2 = 0, res3 = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const d = Math.max(
          Math.abs(a.data[i]! - b.data[i]!),
          Math.abs(a.data[i + 1]! - b.data[i + 1]!),
          Math.abs(a.data[i + 2]! - b.data[i + 2]!),
        );
        if (d === 0) continue;
        strict++;
        if (!matchesNeighborhood(b.data, a.data, W, H, x, y, 1)) res1++;
        if (!matchesNeighborhood(b.data, a.data, W, H, x, y, 2)) res2++;
        if (!matchesNeighborhood(b.data, a.data, W, H, x, y, 3)) res3++;
      }
    }
    const residual = res1;
    corpusStrict += strict;
    corpusResidual += residual;
    corpusRes2 += res2;
    corpusRes3 += res3;
    if (residual === 0) mapsClean++;
    if (residual > worstResidual) { worstResidual = residual; worstMap = `${slug}/${r.map}`; }
    if (strict > 0) {
      lines.push(`${(slug + '/' + r.map).padEnd(12)} strict=${String(strict).padStart(4)}  r1=${String(res1).padStart(4)}  r2=${String(res2).padStart(4)}  r3=${String(res3).padStart(4)}`);
    }
  }
}

lines.sort((a, b) => Number(b.split('r1=')[1]!.split('r2')[0]) - Number(a.split('r1=')[1]!.split('r2')[0]));
console.log(lines.join('\n'));
console.log('\n=== colormap-band-exact parity (neighborhood boundary tolerance) ===');
console.log(`maps total=${mapsTotal}  band-exact maps (r1)=${mapsClean}/${mapsTotal}`);
console.log(`corpus diff px: strict=${corpusStrict}  r1-residual=${corpusResidual}  r2-residual=${corpusRes2}  r3-residual=${corpusRes3}`);
console.log(`worst r1 residual map: ${worstMap} (${worstResidual} px)`);
const totalPlayfield = mapsTotal * 320 * 168;
console.log(`pixel parity: r1=${(100 * (1 - corpusResidual / totalPlayfield)).toFixed(6)}%  r2=${(100 * (1 - corpusRes2 / totalPlayfield)).toFixed(6)}%  r3=${(100 * (1 - corpusRes3 / totalPlayfield)).toFixed(6)}%`);
