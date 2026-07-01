#!/usr/bin/env npx tsx
/** Summarize 2c corpus failures by tier and mismatch geometry. */
import fs from 'node:fs';
import path from 'node:path';

import {
  diffPlayfieldPngFiles,
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const WASM = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm-corpus');

async function mismatchStats(refPng: string, wasmPng: string) {
  const ref = await loadPng(refPng);
  const cand = await loadPng(wasmPng);
  const refView = extractGzdoomView(ref.data, ref.width, ref.height);
  const candView = extractGzdoomView(cand.data, cand.width, cand.height);
  const refNorm = resizePlayfieldToVanilla(refView.data, refView.width, refView.height);
  const candNorm = resizePlayfieldToVanilla(candView.data, candView.width, candView.height);
  let minX = 320,
    maxX = 0,
    minY = 168,
    maxY = 0,
    n = 0;
  const xHist = new Map<number, number>();
  for (let y = 0; y < 168; y++) {
    for (let x = 0; x < 320; x++) {
      const i = (y * 320 + x) * 4;
      const dr = Math.abs(refNorm.data[i]! - candNorm.data[i]!);
      const dg = Math.abs(refNorm.data[i + 1]! - candNorm.data[i + 1]!);
      const db = Math.abs(refNorm.data[i + 2]! - candNorm.data[i + 2]!);
      if (Math.max(dr, dg, db) > 0) {
        n++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        xHist.set(x, (xHist.get(x) ?? 0) + 1);
      }
    }
  }
  const topX = [...xHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { n, minX, maxX, minY, maxY, topX };
}

async function main() {
  const slug = process.argv[2] ?? 'DOOM';
  const mapDir = path.join(GOLD, slug);
  const maps = fs.readdirSync(mapDir).filter((d) => fs.statSync(path.join(mapDir, d)).isDirectory());
  const rows: Array<{ map: string; n: number; tier: string; box: string; topX: string; identical: boolean }> = [];

  for (const map of maps.sort()) {
    const refPng = path.join(GOLD, slug, map, 'ref.png');
    const wasmPng = path.join(WASM, slug, map, 'wasm.png');
    if (!fs.existsSync(wasmPng)) continue;
    const diff = await diffPlayfieldPngFiles(refPng, wasmPng, { tolerance: 0 });
    if (diff.identical) {
      rows.push({ map, n: 0, tier: 'PASS', box: '-', topX: '-', identical: true });
      continue;
    }
    const st = await mismatchStats(refPng, wasmPng);
    const tier =
      st.n <= 2 ? 'T1-micro' : st.n <= 30 ? 'T2-edge' : st.n <= 180 ? 'T3-medium' : 'T4-outdoor';
    rows.push({
      map,
      n: st.n,
      tier,
      box: `${st.minX}-${st.maxX},${st.minY}-${st.maxY}`,
      topX: st.topX.map(([x, c]) => `${x}:${c}`).join(' '),
      identical: false,
    });
  }

  console.log(`\n${slug} corpus summary (${rows.length} maps)\n`);
  console.log('tier       map     n      bbox(x,y)        topX columns');
  for (const r of rows) {
    console.log(
      `${r.tier.padEnd(10)} ${r.map.padEnd(7)} ${String(r.n).padStart(5)}  ${r.box.padEnd(16)} ${r.topX}`,
    );
  }
  const pass = rows.filter((r) => r.identical).length;
  const t1 = rows.filter((r) => r.tier === 'T1-micro').length;
  const t2 = rows.filter((r) => r.tier === 'T2-edge').length;
  const t3 = rows.filter((r) => r.tier === 'T3-medium').length;
  const t4 = rows.filter((r) => r.tier === 'T4-outdoor').length;
  console.log(`\nPASS=${pass} T1=${t1} T2=${t2} T3=${t3} T4=${t4}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
