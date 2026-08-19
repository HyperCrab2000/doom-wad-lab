#!/usr/bin/env npx tsx
/**
 * Classic WebGL spawn parity corpus — all DOOM + DOOM II maps with gold refs (68).
 *
 * Captures each map at player spawn (spawnLock + frameParity) and gates full playfield
 * vs gold ref.png (tol=8, ≤1% mismatch per bucket).
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/test-classic-parity-corpus.mts
 *   npx tsx tools/gzrender-v2/test-classic-parity-corpus.mts E1M2 MAP01
 *
 * Env:
 *   CLASSIC_PARITY_CAPTURE=1  — refresh captures via offline CPU renderer
 *   CLASSIC_PARITY_CAPTURE=webgl — browser WebGL capture (dev on :5150)
 *   CLASSIC_PARITY_CAPTURE=gold — copy gold ref (offline oracle)
 *   CLASSIC_PARITY_MAX_MISMATCH — bucket gate % (default 1)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  diffRgbaBuffers,
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';
import { resolveGoldIwadSlug } from '../../src/wad/parity/frame/goldIwad.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare');
const GOLD_ROOT = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const TOLERANCE = 8;
const W = 320;
const H = 168;

const REGIONS = [
  { id: 'ceiling', y0: 0, y1: 42 },
  { id: 'mid-upper', y0: 42, y1: 84 },
  { id: 'mid-lower', y0: 84, y1: 126 },
  { id: 'floor', y0: 126, y1: 168 },
] as const;

const MAX_MISMATCH =
  process.env.CLASSIC_PARITY_MAX_MISMATCH != null && process.env.CLASSIC_PARITY_MAX_MISMATCH !== ''
    ? Number(process.env.CLASSIC_PARITY_MAX_MISMATCH)
    : 1;

function listCorpusMaps(): Array<{ slug: 'DOOM' | 'DOOM2'; map: string }> {
  const out: Array<{ slug: 'DOOM' | 'DOOM2'; map: string }> = [];
  for (const slug of ['DOOM', 'DOOM2'] as const) {
    const dir = path.join(GOLD_ROOT, slug);
    if (!fs.existsSync(dir)) continue;
    for (const map of fs.readdirSync(dir)) {
      const ref = path.join(dir, map, 'ref.png');
      if (fs.existsSync(ref)) out.push({ slug, map });
    }
  }
  return out.sort((a, b) => `${a.slug}/${a.map}`.localeCompare(`${b.slug}/${b.map}`));
}

function captureMap(map: string): boolean {
  if (process.env.CLASSIC_PARITY_CAPTURE === 'gold') {
    const res = spawnSync('npx', ['tsx', 'tools/gzrender-v2/capture-classic-spawn-gold.mts', map], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    return res.status === 0;
  }
  if (process.env.CLASSIC_PARITY_CAPTURE === 'offline') {
    const res = spawnSync('npx', ['tsx', 'tools/gzrender-v2/capture-classic-spawn-offline.mts', map], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    return res.status === 0;
  }
  // Default: WebGL GPU classic path (frameParity + spawnLock, E1M1 GPU fixes).
  const res = spawnSync('npx', ['tsx', 'tools/gzrender-v2/capture-classic-spawn-webgl.mts', map], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  return res.status === 0;
}

async function loadPlayfield(pngPath: string) {
  const img = await loadPng(path.resolve(pngPath));
  const view = extractGzdoomView(img.data, img.width, img.height);
  return resizePlayfieldToVanilla(view.data, view.width, view.height);
}

function bucketMismatchPct(
  classic: Uint8ClampedArray,
  gold: Uint8ClampedArray,
  y0: number,
  y1: number,
): number {
  const region = { x: 0, y: y0, width: W, height: y1 - y0 };
  const diff = diffRgbaBuffers(classic, gold, W, H, region, TOLERANCE);
  return diff.mismatchRatio * 100;
}

async function evalMap(map: string): Promise<{
  map: string;
  slug: 'DOOM' | 'DOOM2';
  pass: boolean;
  fullPct: number;
  fullFramePct: number;
  buckets: Array<{ id: string; pct: number; pass: boolean }>;
  error?: string;
}> {
  const slug = resolveGoldIwadSlug(map);
  const classicPath = path.join(OUT, `${map}-classic-spawn.png`);
  const goldPath = path.join(GOLD_ROOT, slug, map, 'ref.png');

  if (!fs.existsSync(goldPath)) {
    return { map, slug, pass: false, fullPct: 100, fullFramePct: 100, buckets: [], error: 'missing gold ref' };
  }

  if (process.env.CLASSIC_PARITY_CAPTURE === '1' || process.env.CLASSIC_PARITY_CAPTURE === 'gold' || process.env.CLASSIC_PARITY_CAPTURE === 'webgl') {
    if (!captureMap(map)) {
      return { map, slug, pass: false, fullPct: 100, fullFramePct: 100, buckets: [], error: 'capture failed' };
    }
  } else if (!fs.existsSync(classicPath)) {
    return { map, slug, pass: false, fullPct: 100, fullFramePct: 100, buckets: [], error: 'missing capture (CLASSIC_PARITY_CAPTURE=1 to WebGL capture)' };
  }

  if (!fs.existsSync(classicPath)) {
    return { map, slug, pass: false, fullPct: 100, fullFramePct: 100, buckets: [], error: 'missing capture' };
  }

  const classicImg = await loadPng(classicPath);
  const goldImg = await loadPng(goldPath);
  const classic = await loadPlayfield(classicPath);
  const gold = await loadPlayfield(goldPath);
  const full = diffRgbaBuffers(classic.data, gold.data, W, H, { x: 0, y: 0, width: W, height: H }, TOLERANCE);
  const fullFrame = diffRgbaBuffers(
    classicImg.data,
    goldImg.data,
    classicImg.width,
    classicImg.height,
    { x: 0, y: 0, width: classicImg.width, height: classicImg.height },
    TOLERANCE,
  );
  const buckets = REGIONS.map((region) => {
    const pct = bucketMismatchPct(classic.data, gold.data, region.y0, region.y1);
    return { id: region.id, pct, pass: pct <= MAX_MISMATCH };
  });
  const fullFramePct = fullFrame.mismatchRatio * 100;
  const pass =
    full.mismatchRatio * 100 <= MAX_MISMATCH &&
    fullFramePct <= MAX_MISMATCH &&
    buckets.every((b) => b.pass);
  return { map, slug, pass, fullPct: full.mismatchRatio * 100, fullFramePct, buckets };
}

async function main(): Promise<void> {
  const filter = process.argv.slice(2);
  let maps = listCorpusMaps();
  if (filter.length) {
    maps = maps.filter((m) => filter.includes(m.map));
    const missing = filter.filter((m) => !maps.some((x) => x.map === m));
    if (missing.length) {
      console.error('Unknown or missing gold maps:', missing.join(', '));
      process.exit(2);
    }
  }

  const captureMode =
    process.env.CLASSIC_PARITY_CAPTURE === 'gold'
      ? 'gold copy + diff'
      : process.env.CLASSIC_PARITY_CAPTURE === 'webgl'
        ? 'WebGL capture + diff'
      : process.env.CLASSIC_PARITY_CAPTURE === '1'
        ? 'offline CPU capture + diff'
        : 'diff existing PNGs';
  console.log(`Classic spawn corpus: ${maps.length} maps (${captureMode})`);
  console.log(`Gate: ≤${MAX_MISMATCH}% playfield + full 640×480 + buckets (tol=${TOLERANCE})\n`);

  const results: Awaited<ReturnType<typeof evalMap>>[] = [];
  for (const { slug, map } of maps) {
    process.stdout.write(`${slug}/${map} … `);
    const result = await evalMap(map);
    results.push(result);
    if (result.error) {
      console.log(`FAIL (${result.error})`);
      continue;
    }
    console.log(result.pass ? `PASS (pf ${result.fullPct.toFixed(2)}% frame ${result.fullFramePct.toFixed(2)}%)` : `FAIL (pf ${result.fullPct.toFixed(2)}% frame ${result.fullFramePct.toFixed(2)}%)`);
    if (!result.pass) {
      for (const b of result.buckets) {
        if (!b.pass) console.log(`  ${b.id}: ${b.pct.toFixed(2)}%`);
      }
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`\n--- summary ---`);
  console.log(`PASS ${passed}/${results.length}  FAIL ${failed}/${results.length}`);
  if (failed) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => !x.pass)) {
      const detail = r.error ?? r.buckets.filter((b) => !b.pass).map((b) => `${b.id}=${b.pct.toFixed(1)}%`).join(' ');
      console.log(`  ${r.slug}/${r.map}: ${detail || `${r.fullPct.toFixed(2)}% full`}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('PASS: full DOOM + DOOM II spawn corpus');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
