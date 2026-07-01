#!/usr/bin/env npx tsx
/**
 * Wave 3 gate — E1M1 spawn GZDRAW: native ≡ WASM (byte-identical).
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/verify-gzdraw-wasm.mts
 *
 * Requires: build-gzdoom.sh, build:gzdoom-wasm, npm run dev (5150)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { diffGzdraw, formatGzdrawDiff, readGzdrawFile } from '../../src/wad/parity/gzdraw/index.ts';
import { enumerateViewProbesForMap } from './enumerate-view-probes.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/gzdraw-verify-wasm');
const GZSTATE = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/gzdoom.gzstate');
const CAPTURE_NATIVE = path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-gzdraw.sh');
const CAPTURE_WASM = path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-wasm-gzdraw.mts');
const IWAD = path.join(ROOT, 'public/wads/DOOM.WAD');
const MAP = 'E1M1';
const DEV_URL = process.env.TEST_URL ?? 'http://localhost:5150';

async function devServerUp(): Promise<boolean> {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

function main(): void {
  if (!fs.existsSync(GZSTATE)) {
    console.error(`Missing gold gzstate: ${GZSTATE}`);
    process.exit(2);
  }
  if (!fs.existsSync(path.join(ROOT, 'public/wasm/gzdoom/gzdoom.wasm'))) {
    console.error('Missing gzdoom.wasm — run: npm run build:gzdoom-wasm');
    process.exit(2);
  }

  const spawn = enumerateViewProbesForMap('DOOM.WAD', MAP).find((p) => p.probeId === 0);
  if (!spawn) {
    console.error('Missing spawn probe for E1M1');
    process.exit(2);
  }
  const view = `${spawn.viewX},${spawn.viewY},${spawn.yawDeg}`;

  fs.mkdirSync(OUT, { recursive: true });
  const nativeOut = path.join(OUT, 'spawn-native.gzdraw');
  const wasmOut = path.join(OUT, 'spawn-wasm.gzdraw');

  console.log(`spawn probe: ${view} (probeId=0)`);
  console.log('native capture…');
  execFileSync('bash', [CAPTURE_NATIVE, IWAD, MAP, GZSTATE, view, nativeOut, '0'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, GZDOOM_TIMEOUT: '90' },
  });
}

async function runWasm(): Promise<void> {
  if (!(await devServerUp())) {
    console.error(`Dev server not reachable at ${DEV_URL} — run: npm run dev`);
    process.exit(2);
  }

  const spawn = enumerateViewProbesForMap('DOOM.WAD', MAP).find((p) => p.probeId === 0)!;
  const view = `${spawn.viewX},${spawn.viewY},${spawn.yawDeg}`;
  const nativeOut = path.join(OUT, 'spawn-native.gzdraw');
  const wasmOut = path.join(OUT, 'spawn-wasm.gzdraw');

  console.log('wasm capture…');
  execFileSync('npx', ['tsx', CAPTURE_WASM, MAP, view, '0', wasmOut], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const left = readGzdrawFile(fs.readFileSync(nativeOut));
  const right = readGzdrawFile(fs.readFileSync(wasmOut));
  const diff = diffGzdraw(left, right);
  if (!diff.identical) {
    console.error(formatGzdrawDiff(diff));
    process.exit(1);
  }
  console.log('Wave 3 GZDRAW WASM verify: PASS (native ≡ wasm spawn)');
}

main();
void runWasm();
