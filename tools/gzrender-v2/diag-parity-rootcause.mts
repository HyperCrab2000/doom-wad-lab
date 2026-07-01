#!/usr/bin/env npx tsx
/**
 * Systematic parity root-cause: for EVERY non-strict map in the corpus report, classify WHERE and
 * WHAT the native-vs-wasm diffs are, to tell apart one shared root cause from many separate bugs.
 *
 * Per map we measure:
 *   - band: sky(top third) / mid / floor(bottom third) pixel counts
 *   - topRowFrac: share of diffs in the very top 8 rows (sky-ceiling signature)
 *   - brightFrac: share of diffs where native luma > 140 (bright/lit-texture signature)
 *   - edgeFrac: share of diffs adjacent to a large local gradient (AA/silhouette signature)
 *   - maxΔ
 * Then aggregates corpus-wide so we can see the dominant signature.
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

type Row = { map: string; tier: string; mismatchedPixels: number };
const report = JSON.parse(fs.readFileSync(REPORT, 'utf8')) as Record<
  string,
  { slug: string; results: Row[] }
>;

async function norm(p: string) {
  const { data, width, height } = await loadPng(p);
  const v = extractGzdoomView(data, width, height);
  return resizePlayfieldToVanilla(v.data, v.width, v.height);
}

type MapStat = {
  slug: string;
  map: string;
  tier: string;
  total: number;
  sky: number;
  mid: number;
  floor: number;
  topRowFrac: number;
  brightFrac: number;
  edgeFrac: number;
  maxDelta: number;
};

const stats: MapStat[] = [];

for (const [slug, sec] of Object.entries(report)) {
  for (const r of sec.results) {
    if (r.tier === 'strict') continue; // already perfect
    const nativePath = path.join(GOLD, slug, r.map, 'ref.png');
    const wasmPath = path.join(WASM, slug, r.map, 'wasm.png');
    if (!fs.existsSync(nativePath) || !fs.existsSync(wasmPath)) continue;
    const a = await norm(nativePath);
    const b = await norm(wasmPath);
    const W = a.width, H = a.height;
    let total = 0, sky = 0, mid = 0, floor = 0, topRow = 0, bright = 0, edge = 0, maxDelta = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const d = Math.max(
          Math.abs(a.data[i]! - b.data[i]!),
          Math.abs(a.data[i + 1]! - b.data[i + 1]!),
          Math.abs(a.data[i + 2]! - b.data[i + 2]!),
        );
        if (d === 0) continue;
        total++;
        maxDelta = Math.max(maxDelta, d);
        if (y < H / 3) sky++; else if (y < (2 * H) / 3) mid++; else floor++;
        if (y < 8) topRow++;
        const luma = 0.299 * a.data[i]! + 0.587 * a.data[i + 1]! + 0.114 * a.data[i + 2]!;
        if (luma > 140) bright++;
        // local gradient in native (left/up neighbor) → silhouette/AA edge
        if (x > 0 && y > 0) {
          const l = ((y) * W + (x - 1)) * 4;
          const u = ((y - 1) * W + x) * 4;
          const grad = Math.max(
            Math.abs(a.data[i]! - a.data[l]!), Math.abs(a.data[i]! - a.data[u]!),
          );
          if (grad > 40) edge++;
        }
      }
    }
    if (total === 0) continue;
    stats.push({
      slug, map: r.map, tier: r.tier, total, sky, mid, floor,
      topRowFrac: topRow / total, brightFrac: bright / total, edgeFrac: edge / total, maxDelta,
    });
  }
}

stats.sort((a, b) => b.total - a.total);
console.log('map        tier       total  sky/mid/floor   top8%  bright%  edge%  maxΔ');
for (const s of stats) {
  console.log(
    `${(s.slug + '/' + s.map).padEnd(11)} ${s.tier.padEnd(10)} ${String(s.total).padStart(5)}  ` +
    `${String(s.sky).padStart(4)}/${String(s.mid).padStart(4)}/${String(s.floor).padStart(4)}  ` +
    `${(s.topRowFrac * 100).toFixed(0).padStart(4)}%  ${(s.brightFrac * 100).toFixed(0).padStart(5)}%  ` +
    `${(s.edgeFrac * 100).toFixed(0).padStart(4)}%  ${String(s.maxDelta).padStart(4)}`,
  );
}

const sum = (f: (s: MapStat) => number) => stats.reduce((a, s) => a + f(s), 0);
const grand = sum((s) => s.total);
console.log('\n=== corpus-wide (non-strict maps) ===');
console.log(`maps=${stats.length}  total diff px=${grand}`);
console.log(`  sky=${((sum((s) => s.sky) / grand) * 100).toFixed(1)}%  mid=${((sum((s) => s.mid) / grand) * 100).toFixed(1)}%  floor=${((sum((s) => s.floor) / grand) * 100).toFixed(1)}%`);
console.log(`  in top 8 rows=${((sum((s) => s.topRowFrac * s.total) / grand) * 100).toFixed(1)}%`);
console.log(`  on bright (luma>140) native px=${((sum((s) => s.brightFrac * s.total) / grand) * 100).toFixed(1)}%`);
console.log(`  on high-gradient edges=${((sum((s) => s.edgeFrac * s.total) / grand) * 100).toFixed(1)}%`);
