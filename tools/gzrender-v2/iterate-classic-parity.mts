#!/usr/bin/env tsx
/**
 * One-shot Classic WebGL parity loop: smoke + bucket gates + column probes.
 * Requires dev server at BASE_URL (default http://localhost:5150).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE_URL ?? 'http://localhost:5150';

const steps: Array<{ label: string; script: string; env?: Record<string, string> }> = [
  { label: 'smoke', script: 'tools/gzrender-v2/test-classic-play-smoke.mts' },
  {
    label: 'buckets',
    script: 'tools/gzrender-v2/test-classic-parity-bucket-gates.mts',
    env: { CLASSIC_PARITY_CAPTURE: '1' },
  },
  { label: 'probes', script: 'tools/gzrender-v2/test-classic-parity-probes.mts' },
];

function runStep(label: string, script: string, extraEnv?: Record<string, string>): number {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync('npx', ['tsx', script], {
    cwd: ROOT,
    env: { ...process.env, BASE_URL: BASE, ...extraEnv },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(out);
  if (result.status !== 0) {
    console.error(`FAIL: ${label} exited ${result.status ?? 1}`);
  }
  return result.status ?? 1;
}

async function main(): Promise<void> {
  console.log(`Classic parity iterate @ ${BASE}`);
  const results: Array<{ label: string; ok: boolean }> = [];
  let failed = false;
  for (const step of steps) {
    const code = runStep(step.label, step.script, step.env);
    const ok = code === 0;
    results.push({ label: step.label, ok });
    if (!ok) failed = true;
  }
  console.log('\n--- summary ---');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label}`);
  }
  if (failed) process.exit(1);
  console.log('PASS: all parity gates');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
