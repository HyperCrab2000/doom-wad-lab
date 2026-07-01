#!/usr/bin/env npx tsx
/**
 * Recapture + strict-diff one 2c wave (T1–T4). Requires dev server + wasm build.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/fix-2c-tier.mts [--tier T1|T2|T3|T4] [--recapture]
 *
 * See docs/gzrender-v2/phase-2c-breakdown.md
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  CORPUS_2C_PHASE_BY_TIER,
  CORPUS_TIER_MAPS,
  sortMapsByFixPriority,
  type CorpusTierId,
} from '../../src/gzdoom-oracle/corpusTiers.ts';
import { diffPlayfieldPngFiles } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CAPTURE = path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-wasm-frame.mts');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm-corpus');

function slugForMap(map: string): string {
  return map.startsWith('MAP') ? 'DOOM2' : 'DOOM';
}

function capture(map: string): boolean {
  const wasmPng = path.join(OUT, slugForMap(map), map, 'wasm.png');
  fs.mkdirSync(path.dirname(wasmPng), { recursive: true });
  const res = spawnSync('npx', ['tsx', CAPTURE, map, wasmPng], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  return res.status === 0;
}

async function strictPx(map: string): Promise<number> {
  const slug = slugForMap(map);
  const ref = path.join(GOLD, slug, map, 'ref.png');
  const wasm = path.join(OUT, slug, map, 'wasm.png');
  const d = await diffPlayfieldPngFiles(ref, wasm, { tolerance: 0 });
  return d.mismatchedPixels;
}

function parseTier(): CorpusTierId {
  const idx = process.argv.indexOf('--tier');
  const raw = idx >= 0 ? process.argv[idx + 1] : 'T1';
  if (raw === 'T1' || raw === 'T2' || raw === 'T3' || raw === 'T4') return raw;
  throw new Error(`Unknown tier ${raw} — use T1|T2|T3|T4`);
}

async function main() {
  const tier = parseTier();
  const phase = CORPUS_2C_PHASE_BY_TIER[tier];
  const recapture = process.argv.includes('--recapture');
  const maps = sortMapsByFixPriority([...CORPUS_TIER_MAPS[tier]]);

  console.log(`Phase ${phase} (${tier}) — ${maps.length} maps (recapture=${recapture})\n`);

  let strict = 0;
  let fail = 0;
  for (const map of maps) {
    if (recapture && !capture(map)) {
      console.error(`  ${map}: CAPTURE_FAIL`);
      fail++;
      continue;
    }
    const px = await strictPx(map);
    const tag = px === 0 ? 'STRICT_OK' : `Δ${px}px`;
    console.log(`  ${map}: ${tag}`);
    if (px === 0) strict++;
    else fail++;
  }
  console.log(`\n${phase} ${tier}: strict=${strict}/${maps.length} fail=${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
