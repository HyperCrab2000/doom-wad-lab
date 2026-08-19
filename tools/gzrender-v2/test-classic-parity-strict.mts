#!/usr/bin/env tsx
/**
 * Strict (100%) Classic spawn parity gate vs modular oracle capture.
 *
 * Sets CLASSIC_PARITY_MAX_MISMATCH=0 and CLASSIC_MODULAR_PARITY_REQUIRED=1.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MAP = process.argv[2] ?? 'E1M1';

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
  console.log(`[classic-parity-strict] map=${MAP} required=100% match`);
  await run('npx', ['tsx', 'tools/gzrender-v2/compare-classic-modular-spawn.mts', MAP], {
    CLASSIC_MODULAR_PARITY_REQUIRED: '1',
    CLASSIC_PARITY_MAX_MISMATCH: '0',
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
