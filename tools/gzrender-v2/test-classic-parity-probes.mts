#!/usr/bin/env tsx
/**
 * Offline pixel-probe gate: sample center column vs gold on existing captures.
 * Does not require dev server — uses parity-compare PNG when present.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/test-classic-parity-probes.mts [MAP]
 *
 * Env:
 *   CLASSIC_PARITY_CAPTURE=1  — force re-capture first (needs dev on :5150)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { loadPng, extractGzdoomView, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';
import { resolveGoldIwadSlug } from '../../src/wad/parity/frame/goldIwad.ts';
import { classicParityCaptureEnv, useClassicFrameParityCapture } from './classicParityCaptureMode.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare');
const MAP = process.argv[2] ?? 'E1M1';
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard', resolveGoldIwadSlug(MAP), MAP, 'ref.png');
const CLASSIC = path.join(OUT, `${MAP}-classic-spawn.png`);

/** Center-column + lateral probes documented in classic-parity-ladder.md */
const PROBES: Array<{ x: number; y: number; maxDelta: number; label: string }> = [
  { x: 160, y: 5, maxDelta: 8, label: 'ceiling band (Step 1)' },
  { x: 160, y: 60, maxDelta: 8, label: 'mid-upper eye line (Step 2)' },
  { x: 48, y: 60, maxDelta: 24, label: 'mid-upper left wall (Step 2)' },
  { x: 272, y: 60, maxDelta: 24, label: 'mid-upper right wall (Step 2)' },
  { x: 160, y: 100, maxDelta: 24, label: 'mid-lower colormap (Step 4 interim)' },
  { x: 80, y: 150, maxDelta: 16, label: 'floor band left (Step 3 — avoids weapon)' },
];

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

async function sampleRgb(pngPath: string, x: number, y: number): Promise<[number, number, number]> {
  const img = await loadPng(path.resolve(pngPath));
  const view = extractGzdoomView(img.data, img.width, img.height);
  const pf = resizePlayfieldToVanilla(view.data, view.width, view.height);
  const i = (y * 320 + x) * 4;
  return [pf.data[i]!, pf.data[i + 1]!, pf.data[i + 2]!];
}

async function main(): Promise<void> {
  if (process.env.CLASSIC_PARITY_CAPTURE === '1' || !fs.existsSync(CLASSIC)) {
    console.log(
      `Capturing Classic spawn (${MAP}) (${useClassicFrameParityCapture() ? 'frameParity' : 'play'})…`,
    );
    await run('npx', ['tsx', 'tools/gzrender-v2/compare-classic-modular-spawn.mts', MAP], classicParityCaptureEnv());
  }
  if (!fs.existsSync(CLASSIC) || !fs.existsSync(GOLD)) {
    console.error('Missing classic capture or gold ref — run dev on :5150 and CLASSIC_PARITY_CAPTURE=1');
    process.exit(1);
  }

  console.log(`Classic: ${CLASSIC}`);
  console.log(`Gold:    ${GOLD}\n`);
  console.log('| X | Y | Gold RGB | Classic RGB | Delta | Max | Pass | Notes |');
  console.log('|---|----|----------|-------------|-------|-----|------|-------|');

  let failed = false;
  for (const probe of PROBES) {
    const gold = await sampleRgb(GOLD, probe.x, probe.y);
    const classic = await sampleRgb(CLASSIC, probe.x, probe.y);
    const delta = Math.max(
      Math.abs(gold[0] - classic[0]),
      Math.abs(gold[1] - classic[1]),
      Math.abs(gold[2] - classic[2]),
    );
    const pass = delta <= probe.maxDelta;
    if (!pass) failed = true;
    console.log(
      `| ${probe.x} | ${probe.y} | ${gold.join(',')} | ${classic.join(',')} | ${delta} | ${probe.maxDelta} | ${pass ? 'PASS' : 'FAIL'} | ${probe.label} |`,
    );
  }

  if (failed) {
    console.error('\nFAIL: one or more probes exceed threshold');
    process.exit(1);
  }
  console.log('\nPASS: all center-column probes within threshold');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
