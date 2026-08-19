#!/usr/bin/env tsx
/**
 * Per-bucket parity gates: Classic spawn vs gold ref.png by screen region.
 *
 * Uses existing capture when present, or runs compare-classic-modular-spawn to capture.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/test-classic-parity-bucket-gates.mts [MAP]
 *
 * Env:
 *   CLASSIC_PARITY_BUCKET     — optional: ceiling | mid-upper | mid-lower | floor
 *   CLASSIC_PARITY_MAX_MISMATCH — override % threshold (default: per-bucket interim)
 *   CLASSIC_PARITY_CAPTURE=1  — force re-capture (dev server on :5150)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  diffRgbaBuffers,
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';
import { resolveGoldIwadSlug } from '../../src/wad/parity/frame/goldIwad.ts';
import { classicParityCaptureEnv, useClassicFrameParityCapture } from './classicParityCaptureMode.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare');
const MAP = process.argv[2] ?? 'E1M1';
const TOLERANCE = 8;

const W = 320;
const H = 168;

/** Screen bands (Doom playfield Y-down, 320×168). */
const REGIONS: Array<{ id: string; y0: number; y1: number; note: string }> = [
  { id: 'ceiling', y0: 0, y1: 42, note: 'Top quarter — ceiling / upper wall' },
  { id: 'mid-upper', y0: 42, y1: 84, note: 'Eye line / mid walls' },
  { id: 'mid-lower', y0: 84, y1: 126, note: 'Floor transition / nukage band' },
  { id: 'floor', y0: 126, y1: 168, note: 'Lower floor / weapon lip' },
];

/** Production gate: ≤1% mismatch per bucket (≥99% match, tol=8). */
const DEFAULT_BUCKET_MAX_MISMATCH: Record<string, number> = {
  ceiling: 1,
  'mid-upper': 1,
  'mid-lower': 1,
  floor: 1,
};

type DeltaClass = 'exact' | 'colormap' | 'moderate' | 'structural';

function classifyDelta(delta: number): DeltaClass {
  if (delta === 0) return 'exact';
  if (delta <= 24) return 'colormap';
  if (delta <= 63) return 'moderate';
  return 'structural';
}

function run(cmd: string, args: string[], env: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, ...env },
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function loadPlayfield(pngPath: string) {
  const img = await loadPng(path.resolve(pngPath));
  const view = extractGzdoomView(img.data, img.width, img.height);
  return resizePlayfieldToVanilla(view.data, view.width, view.height);
}

async function ensureClassicCapture(classicPath: string): Promise<void> {
  if (fs.existsSync(classicPath) && process.env.CLASSIC_PARITY_CAPTURE !== '1') {
    console.log(`Using existing capture: ${classicPath}`);
    return;
  }
  console.log(`Capturing Classic spawn (${MAP}) from gold oracle…`);
  await run('npx', ['tsx', 'tools/gzrender-v2/capture-classic-spawn-webgl.mts', MAP], classicParityCaptureEnv());
}

interface BucketStats {
  id: string;
  y0: number;
  y1: number;
  note: string;
  mismatchPct: number;
  mismatched: number;
  compared: number;
  colormapish: number;
  structural: number;
  maxAllowed: number;
  pass: boolean;
}

function analyzeBucket(
  classic: Uint8ClampedArray,
  gold: Uint8ClampedArray,
  region: (typeof REGIONS)[number],
): Omit<BucketStats, 'maxAllowed' | 'pass'> {
  let compared = 0;
  let mismatched = 0;
  let colormapish = 0;
  let structural = 0;

  for (let y = region.y0; y < region.y1; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dr = Math.abs(classic[i]! - gold[i]!);
      const dg = Math.abs(classic[i + 1]! - gold[i + 1]!);
      const db = Math.abs(classic[i + 2]! - gold[i + 2]!);
      const delta = Math.max(dr, dg, db);
      compared++;
      if (delta <= TOLERANCE) continue;
      mismatched++;
      const cls = classifyDelta(delta);
      if (cls === 'colormap' || cls === 'moderate') colormapish++;
      if (cls === 'structural') structural++;
    }
  }

  const mismatchPct = compared ? (mismatched / compared) * 100 : 0;
  return {
    id: region.id,
    y0: region.y0,
    y1: region.y1,
    note: region.note,
    mismatchPct,
    mismatched,
    compared,
    colormapish,
    structural,
  };
}

function bucketThreshold(bucketId: string): number {
  const override = process.env.CLASSIC_PARITY_MAX_MISMATCH;
  if (override != null && override !== '') return Number(override);
  return DEFAULT_BUCKET_MAX_MISMATCH[bucketId] ?? 100;
}

async function main(): Promise<void> {
  const classicPath = path.join(OUT, `${MAP}-classic-spawn.png`);
  const goldPath = path.join(
    ROOT,
    'artifacts/gzrender-v2/gold-standard',
    resolveGoldIwadSlug(MAP),
    MAP,
    'ref.png',
  );

  await ensureClassicCapture(classicPath);

  if (!fs.existsSync(classicPath)) {
    console.error(`Missing Classic capture: ${classicPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(goldPath)) {
    console.error(`Missing gold ref: ${goldPath}`);
    process.exit(1);
  }

  const classic = await loadPlayfield(classicPath);
  const gold = await loadPlayfield(goldPath);

  const full = diffRgbaBuffers(classic.data, gold.data, W, H, { x: 0, y: 0, width: W, height: H }, TOLERANCE);
  console.log(`Classic: ${classicPath}`);
  console.log(`Gold:    ${goldPath}`);
  console.log(
    `Full playfield (tol=${TOLERANCE}): ${(full.mismatchRatio * 100).toFixed(2)}% mismatch (${full.mismatchedPixels}/${full.comparedPixels} px)`,
  );
  console.log(`meanAbsDelta=${full.meanAbsDelta.toFixed(2)} maxChannelDelta=${full.maxChannelDelta}\n`);

  const filterBucket = process.env.CLASSIC_PARITY_BUCKET?.trim();
  const regions = filterBucket ? REGIONS.filter((r) => r.id === filterBucket) : REGIONS;
  if (filterBucket && regions.length === 0) {
    console.error(`Unknown CLASSIC_PARITY_BUCKET=${filterBucket} (ceiling | mid-upper | mid-lower | floor)`);
    process.exit(2);
  }

  const results: BucketStats[] = regions.map((region) => {
    const stats = analyzeBucket(classic.data, gold.data, region);
    const maxAllowed = bucketThreshold(region.id);
    return { ...stats, maxAllowed, pass: stats.mismatchPct <= maxAllowed };
  });

  console.log('| Region | Y range | Mismatch % | Gate % | Colormap-ish | Structural | Pass | Notes |');
  console.log('|--------|---------|------------|--------|--------------|------------|------|-------|');

  let failed = false;
  for (const row of results) {
    const passMark = row.pass ? 'PASS' : 'FAIL';
    if (!row.pass) failed = true;
    console.log(
      `| ${row.id} | ${row.y0}–${row.y1} | ${row.mismatchPct.toFixed(1)}% | ${row.maxAllowed}% | ${row.colormapish} px | ${row.structural} px | ${passMark} | ${row.note} |`,
    );
  }

  if (failed) {
    console.error('\nFAIL: one or more buckets exceed gate threshold');
    process.exit(1);
  }
  console.log('\nPASS: all checked buckets within gate threshold');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
