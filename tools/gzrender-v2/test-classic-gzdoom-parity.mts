#!/usr/bin/env tsx
/**
 * Gate: Classic WebGL spawn frame vs GZDoom modular (s) oracle.
 * Does NOT pass until mismatch is below threshold — never claim parity without this.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

import { classicParityCaptureEnv, useClassicFrameParityCapture } from './classicParityCaptureMode.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MAP = process.argv[2] ?? 'E1M1';
const MAX_MISMATCH_PERCENT = Number(process.env.CLASSIC_PARITY_MAX_MISMATCH ?? '15');

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

async function main(): Promise<void> {
  const mode = useClassicFrameParityCapture() ? 'frameParity oracle' : 'normal play spawn';
  console.log(`[classic-gzdoom-parity] map=${MAP} mode=${mode} maxMismatch=${MAX_MISMATCH_PERCENT}%`);
  await run('npx', ['tsx', 'tools/gzrender-v2/compare-classic-modular-spawn.mts', MAP], {
    CLASSIC_MODULAR_PARITY_REQUIRED: '1',
    CLASSIC_PARITY_MAX_MISMATCH: String(MAX_MISMATCH_PERCENT),
    ...classicParityCaptureEnv(),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
