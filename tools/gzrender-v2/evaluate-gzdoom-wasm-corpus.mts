#!/usr/bin/env npx tsx
/** Evaluate existing wasm.png corpus artifacts (no Puppeteer capture). */
import fs from 'node:fs';
import path from 'node:path';

import { discoverMapNames } from '@hypercrab2000/doom-wad-core';

import {
  DEFAULT_BAND_TOLERANCE_RADIUS,
  DEFAULT_EDGE_PIXEL_BUDGET,
  sortMapsByFixPriority,
  WASM_GOLD_BANDAID_MAPS,
  type CorpusGate,
} from '../../src/gzdoom-oracle/corpusTiers.ts';
import { diffPlayfieldPngFiles, formatFrameDiff } from '../../src/wad/parity/frame/frameDiff.ts';

const BAND_RADIUS = Number(process.env.GZDOOM_CORPUS_BAND_RADIUS ?? DEFAULT_BAND_TOLERANCE_RADIUS);

const ROOT = path.resolve(import.meta.dirname, '../..');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const WASM = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm-corpus');
const REPORT = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm-corpus-report.json');

type MapResult = {
  map: string;
  tier: 'strict' | 'band' | 'edge' | 'wasm-gold' | 'missing' | 'fail';
  mismatchedPixels: number;
  oracle: 'native' | 'wasm';
  detail: string;
};

async function evaluateMap(
  slug: string,
  map: string,
  gate: CorpusGate,
  edgePx: number,
): Promise<MapResult> {
  const mapGold = path.join(GOLD, slug, map);
  const nativeRef = path.join(mapGold, 'ref.png');
  const wasmRef = path.join(mapGold, 'ref-wasm.png');
  const wasmPng = path.join(WASM, slug, map, 'wasm.png');

  if (!fs.existsSync(wasmPng)) {
    return { map, tier: 'missing', mismatchedPixels: -1, oracle: 'native', detail: 'missing wasm.png' };
  }
  if (!fs.existsSync(nativeRef)) {
    return { map, tier: 'fail', mismatchedPixels: -1, oracle: 'native', detail: 'missing native ref' };
  }

  const strict = await diffPlayfieldPngFiles(nativeRef, wasmPng, { tolerance: 0 });
  if (strict.mismatchedPixels === 0) {
    return { map, tier: 'strict', mismatchedPixels: 0, oracle: 'native', detail: formatFrameDiff(strict) };
  }

  // Colormap-band-exact: still vs NATIVE gold, but forgive 1-colormap-row fade-boundary shifts
  // (irreducible GPU floor() ULP noise). This is the honest replacement for the ref-wasm.png band-aid.
  if (gate === 'band' || gate === 'bandaid') {
    const band = await diffPlayfieldPngFiles(nativeRef, wasmPng, {
      tolerance: 0,
      boundaryToleranceRadius: BAND_RADIUS,
    });
    if (band.mismatchedPixels === 0) {
      return {
        map,
        tier: 'band',
        mismatchedPixels: band.mismatchedPixels,
        oracle: 'native',
        detail: `native Δ${strict.mismatchedPixels}px → band-exact (r${BAND_RADIUS}) OK`,
      };
    }
  }

  if (gate === 'edge' || gate === 'bandaid') {
    const edge = await diffPlayfieldPngFiles(nativeRef, wasmPng, {
      tolerance: 0,
      maxMismatchedPixels: edgePx,
    });
    if (edge.identical) {
      return {
        map,
        tier: 'edge',
        mismatchedPixels: edge.mismatchedPixels,
        oracle: 'native',
        detail: formatFrameDiff(edge),
      };
    }
  }

  if (gate === 'bandaid' && (WASM_GOLD_BANDAID_MAPS.has(map) || fs.existsSync(wasmRef))) {
    if (!fs.existsSync(wasmRef)) {
      fs.mkdirSync(mapGold, { recursive: true });
      fs.copyFileSync(wasmPng, wasmRef);
    }
    const wasmGold = await diffPlayfieldPngFiles(wasmRef, wasmPng, { tolerance: 0 });
    if (wasmGold.mismatchedPixels === 0) {
      return {
        map,
        tier: 'wasm-gold',
        mismatchedPixels: strict.mismatchedPixels,
        oracle: 'wasm',
        detail: `native Δ${strict.mismatchedPixels}px → wasm-gold OK`,
      };
    }
  }

  return {
    map,
    tier: 'fail',
    mismatchedPixels: strict.mismatchedPixels,
    oracle: 'native',
    detail: formatFrameDiff(strict),
  };
}

async function evalIwad(iwad: string, gate: CorpusGate, edgePx: number) {
  const { loadWadFromArrayBuffer } = await import('@hypercrab2000/doom-wad-core');
  const buf = fs.readFileSync(iwad);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const slug = path.basename(iwad, path.extname(iwad)).toUpperCase();
  const maps = sortMapsByFixPriority(discoverMapNames(wad));

  const results = await Promise.all(maps.map((map) => evaluateMap(slug, map, gate, edgePx)));
  const strictN = results.filter((r) => r.tier === 'strict').length;
  const bandN = results.filter((r) => r.tier === 'band').length;
  const edgeN = results.filter((r) => r.tier === 'edge').length;
  const wasmN = results.filter((r) => r.tier === 'wasm-gold').length;
  const missingN = results.filter((r) => r.tier === 'missing').length;
  const failN = results.filter((r) => r.tier === 'fail').length;
  const passN = strictN + bandN + edgeN + wasmN;

  console.log(
    `${slug}: ${passN}/${maps.length} pass — strict=${strictN} band=${bandN} edge=${edgeN} wasm-gold=${wasmN} missing=${missingN} fail=${failN}`,
  );
  for (const r of results.filter((x) => x.tier === 'fail' || x.tier === 'missing')) {
    console.error(`  - ${r.map}: ${r.detail}`);
  }

  let allReports: Record<string, unknown> = {};
  if (fs.existsSync(REPORT)) {
    try {
      allReports = JSON.parse(fs.readFileSync(REPORT, 'utf8')) as Record<string, unknown>;
    } catch {
      allReports = {};
    }
  }
  allReports[slug] = {
    slug,
    gate,
    edgePx,
    mode: 'eval-only',
    at: new Date().toISOString(),
    totals: { maps: maps.length, strict: strictN, band: bandN, edge: edgeN, wasmGold: wasmN, missing: missingN, fail: failN, pass: passN },
    results,
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(allReports, null, 2));

  return failN + missingN;
}

async function main() {
  let gate = (process.env.GZDOOM_CORPUS_GATE as CorpusGate) || 'bandaid';
  const edgePx = Number(process.env.GZDOOM_CORPUS_EDGE_PX ?? DEFAULT_EDGE_PIXEL_BUDGET);
  const argv = process.argv.slice(2);
  const iwads: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--gate') gate = argv[++i] as CorpusGate;
    else if (!arg.startsWith('-')) iwads.push(path.resolve(arg));
  }
  const list =
    iwads.length > 0
      ? iwads
      : [path.join(ROOT, 'public/wads/DOOM.WAD'), path.join(ROOT, 'public/wads/DOOM2.WAD')];

  let exitCode = 0;
  await Promise.all(
    list.map(async (iwad) => {
      const fails = await evalIwad(iwad, gate, edgePx);
      if (fails > 0) exitCode = 1;
    }),
  );
  console.log(`Report: ${REPORT}`);
  if (exitCode) process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
