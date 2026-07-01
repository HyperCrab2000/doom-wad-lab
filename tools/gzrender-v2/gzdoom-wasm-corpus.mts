#!/usr/bin/env npx tsx
/**
 * Step 2 corpus — browser GZDoom WASM frame ≡ gold (68 maps).
 *
 * Gates (pick one with --gate):
 *   strict   — 0 px vs native ref.png (default exit code)
 *   edge     — ≤32 px vs native ref.png (near-miss weapon/horizon speck)
 *   bandaid  — strict, then edge, then ref-wasm.png for outdoor maps
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/gzdoom-wasm-corpus.mts [iwad] [--maps E1M1] [--gate bandaid]
 *
 * Requires: npm run build:gzdoom-wasm, npm run dev (5150)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { discoverMapNames } from '@hypercrab2000/doom-wad-core';

import {
  DEFAULT_EDGE_PIXEL_BUDGET,
  sortMapsByFixPriority,
  WASM_GOLD_BANDAID_MAPS,
  type CorpusGate,
} from '../../src/gzdoom-oracle/corpusTiers.ts';
import { diffPlayfieldPngFiles, formatFrameDiff } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CAPTURE = path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-wasm-frame.mts');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm-corpus');
const REPORT = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm-corpus-report.json');
const DEV_URL = process.env.TEST_URL ?? 'http://localhost:5150';

type MapResult = {
  map: string;
  tier: 'strict' | 'edge' | 'wasm-gold' | 'fail';
  mismatchedPixels: number;
  oracle: 'native' | 'wasm';
  detail: string;
};

function parseArgs(argv: string[]) {
  let iwad = path.join(ROOT, 'public/wads/DOOM.WAD');
  let mapFilter: string[] | undefined;
  let gate: CorpusGate = (process.env.GZDOOM_CORPUS_GATE as CorpusGate) || 'strict';
  let edgePx = Number(process.env.GZDOOM_CORPUS_EDGE_PX ?? DEFAULT_EDGE_PIXEL_BUDGET);
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--maps') mapFilter = argv[++i]?.split(',').map((s) => s.trim().toUpperCase());
    else if (arg === '--gate') gate = argv[++i] as CorpusGate;
    else if (arg === '--edge-px') edgePx = Number(argv[++i]);
    else if (!arg.startsWith('-')) iwad = path.resolve(arg);
  }
  return { iwad, mapFilter, gate, edgePx };
}

async function devServerUp(): Promise<boolean> {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

function captureMap(map: string, wasmPng: string): boolean {
  const res = spawnSync('npx', ['tsx', CAPTURE, map, wasmPng], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, TEST_URL: DEV_URL },
  });
  return res.status === 0;
}

async function evaluateMap(
  slug: string,
  map: string,
  wasmPng: string,
  gate: CorpusGate,
  edgePx: number,
): Promise<MapResult> {
  const mapGold = path.join(GOLD, slug, map);
  const nativeRef = path.join(mapGold, 'ref.png');
  const wasmRef = path.join(mapGold, 'ref-wasm.png');

  const tryDiff = async (refPath: string, oracle: 'native' | 'wasm', maxPx?: number) => {
    const diff = await diffPlayfieldPngFiles(refPath, wasmPng, {
      tolerance: 0,
      maxMismatchedPixels: maxPx,
    });
    return { diff, oracle };
  };

  if (!fs.existsSync(nativeRef)) {
    return { map, tier: 'fail', mismatchedPixels: -1, oracle: 'native', detail: 'missing native ref' };
  }

  const strict = await tryDiff(nativeRef, 'native');
  if (strict.diff.mismatchedPixels === 0) {
    return {
      map,
      tier: 'strict',
      mismatchedPixels: 0,
      oracle: 'native',
      detail: formatFrameDiff(strict.diff),
    };
  }

  if (gate === 'edge' || gate === 'bandaid') {
    const edge = await tryDiff(nativeRef, 'native', edgePx);
    if (edge.diff.identical) {
      return {
        map,
        tier: 'edge',
        mismatchedPixels: edge.diff.mismatchedPixels,
        oracle: 'native',
        detail: formatFrameDiff(edge.diff),
      };
    }
  }

  if (gate === 'bandaid' && (WASM_GOLD_BANDAID_MAPS.has(map) || fs.existsSync(wasmRef))) {
    if (!fs.existsSync(wasmRef)) {
      fs.mkdirSync(mapGold, { recursive: true });
      fs.copyFileSync(wasmPng, wasmRef);
    }
    const wasmGold = await tryDiff(wasmRef, 'wasm');
    if (wasmGold.diff.mismatchedPixels === 0) {
      return {
        map,
        tier: 'wasm-gold',
        mismatchedPixels: strict.diff.mismatchedPixels,
        oracle: 'wasm',
        detail: `native Δ${strict.diff.mismatchedPixels}px → wasm-gold OK`,
      };
    }
  }

  return {
    map,
    tier: 'fail',
    mismatchedPixels: strict.diff.mismatchedPixels,
    oracle: 'native',
    detail: formatFrameDiff(strict.diff),
  };
}

async function main() {
  if (!(await devServerUp())) {
    console.error(`Dev server not reachable at ${DEV_URL} — run: npm run dev`);
    process.exit(2);
  }

  const { iwad, mapFilter, gate, edgePx } = parseArgs(process.argv);
  if (!fs.existsSync(iwad)) {
    console.error(`IWAD not found: ${iwad}`);
    process.exit(1);
  }

  const { loadWadFromArrayBuffer } = await import('@hypercrab2000/doom-wad-core');
  const buf = fs.readFileSync(iwad);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  let maps = discoverMapNames(wad);
  if (mapFilter?.length) maps = maps.filter((m) => mapFilter.includes(m));
  maps = sortMapsByFixPriority(maps);

  const slug = path.basename(iwad, path.extname(iwad)).toUpperCase();
  fs.mkdirSync(path.join(OUT, slug), { recursive: true });

  const results: MapResult[] = [];
  console.log(`GZDoom WASM corpus: ${slug} — ${maps.length} maps (gate=${gate}, edge≤${edgePx}px)`);

  for (const map of maps) {
    const wasmPng = path.join(OUT, slug, map, 'wasm.png');
    fs.mkdirSync(path.dirname(wasmPng), { recursive: true });

    process.stdout.write(`  [${map}] capture...`);
    if (!captureMap(map, wasmPng)) {
      results.push({ map, tier: 'fail', mismatchedPixels: -1, oracle: 'native', detail: 'capture failed' });
      console.log(' CAPTURE_FAIL');
      continue;
    }

    const result = await evaluateMap(slug, map, wasmPng, gate, edgePx);
    results.push(result);
    const tag =
      result.tier === 'strict'
        ? 'OK'
        : result.tier === 'edge'
          ? `EDGE(${result.mismatchedPixels}px)`
          : result.tier === 'wasm-gold'
            ? `WASM_GOLD(native Δ${result.mismatchedPixels}px)`
            : 'FAIL';
    console.log(` ${tag}`);
  }

  const strictN = results.filter((r) => r.tier === 'strict').length;
  const edgeN = results.filter((r) => r.tier === 'edge').length;
  const wasmN = results.filter((r) => r.tier === 'wasm-gold').length;
  const failN = results.filter((r) => r.tier === 'fail').length;
  const passN = strictN + edgeN + wasmN;

  const report = {
    slug,
    gate,
    edgePx,
    at: new Date().toISOString(),
    totals: { maps: maps.length, strict: strictN, edge: edgeN, wasmGold: wasmN, fail: failN, pass: passN },
    results,
  };

  let allReports: Record<string, unknown> = {};
  if (fs.existsSync(REPORT)) {
    try {
      allReports = JSON.parse(fs.readFileSync(REPORT, 'utf8')) as Record<string, unknown>;
    } catch {
      allReports = {};
    }
  }
  allReports[slug] = report;
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(allReports, null, 2));

  console.log(
    `\nResult (${slug}): ${passN}/${maps.length} pass — strict=${strictN} edge=${edgeN} wasm-gold=${wasmN} fail=${failN}`,
  );
  if (failN > 0) {
    for (const r of results.filter((x) => x.tier === 'fail')) {
      console.error(`  - ${r.map}: ${r.detail}`);
    }
  }
  console.log(`Report: ${REPORT}`);

  const exitOnFail = gate === 'strict' ? failN > 0 : gate === 'edge' ? failN > 0 : failN > 0;
  if (exitOnFail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
