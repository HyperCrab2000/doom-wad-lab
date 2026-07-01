#!/usr/bin/env npx tsx
/**
 * Layered display-mode corpus — WASM vs native gold per mode (68 maps × N modes).
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/display-mode-corpus.mts [iwad] [--maps E1M1] [--modes full,notexture]
 *
 * Requires: npm run dev (5150), npm run build:gzdoom-wasm, gold ref-<mode>.png per mode
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { discoverMapNames } from '@hypercrab2000/doom-wad-core';

import {
  DISPLAY_MODE_CORPUS_ORDER,
  DISPLAY_MODES,
  displayModeRefFilename,
  inferParityFailureLayer,
  parseDisplayModeId,
  type DisplayModeId,
} from '../../src/gzdoom-oracle/parityDisplayModes.ts';
import { diffPlayfieldPngFiles, formatFrameDiff } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CAPTURE = path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-wasm-frame.mts');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/display-mode-corpus');
const DEV_URL = process.env.TEST_URL ?? 'http://localhost:5150';

function parseArgs(argv: string[]) {
  let iwad = path.join(ROOT, 'public/wads/DOOM.WAD');
  let mapFilter: string[] | undefined;
  let modes: DisplayModeId[] = [...DISPLAY_MODE_CORPUS_ORDER];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--maps') mapFilter = argv[++i]?.split(',').map((s) => s.trim().toUpperCase());
    else if (arg === '--modes') modes = argv[++i]!.split(',').map((s) => parseDisplayModeId(s.trim()));
    else if (!arg.startsWith('-')) iwad = path.resolve(arg);
  }
  return { iwad, mapFilter, modes };
}

async function devServerUp(): Promise<boolean> {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

interface MapModeReport {
  map: string;
  modes: Partial<Record<DisplayModeId, { pass: boolean; detail: string }>>;
  inferredLayer: string;
}

async function main() {
  if (!(await devServerUp())) {
    console.error(`Dev server not reachable at ${DEV_URL} — run: npm run dev`);
    process.exit(2);
  }

  const { iwad, mapFilter, modes } = parseArgs(process.argv);
  if (!fs.existsSync(iwad)) {
    console.error(`IWAD not found: ${iwad}`);
    process.exit(1);
  }

  const { loadWadFromArrayBuffer } = await import('@hypercrab2000/doom-wad-core');
  const buf = fs.readFileSync(iwad);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  let maps = discoverMapNames(wad);
  if (mapFilter?.length) maps = maps.filter((m) => mapFilter.includes(m));

  const slug = path.basename(iwad, path.extname(iwad)).toUpperCase();
  fs.mkdirSync(path.join(OUT, slug), { recursive: true });

  const reports: MapModeReport[] = [];
  let totalPass = 0;
  let totalFail = 0;

  console.log(`Display-mode corpus: ${slug} — ${maps.length} maps × ${modes.length} modes`);
  for (const mode of modes) {
    console.log(`  mode ${mode}: ${DISPLAY_MODES[mode].isolates}`);
  }
  console.log('');

  for (const map of maps) {
    const modeResults: MapModeReport['modes'] = {};

    for (const mode of modes) {
      const goldPng = path.join(GOLD, slug, map, displayModeRefFilename(mode));
      const wasmPng = path.join(OUT, slug, map, `wasm-${mode}.png`);
      fs.mkdirSync(path.dirname(wasmPng), { recursive: true });

      if (!fs.existsSync(goldPng)) {
        totalFail++;
        modeResults[mode] = { pass: false, detail: 'missing gold' };
        continue;
      }

      process.stdout.write(`  [${map}/${mode}]...`);
      const res = spawnSync('npx', ['tsx', CAPTURE, map, wasmPng, mode], {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, TEST_URL: DEV_URL },
      });

      if (res.status !== 0) {
        totalFail++;
        modeResults[mode] = { pass: false, detail: 'capture failed' };
        console.log(' CAPTURE_FAIL');
        continue;
      }

      const diff = await diffPlayfieldPngFiles(goldPng, wasmPng, { tolerance: 0 });
      const detail = formatFrameDiff(diff);
      modeResults[mode] = { pass: diff.identical, detail };
      if (diff.identical) {
        totalPass++;
        console.log(` OK (${detail})`);
      } else {
        totalFail++;
        console.log(` MISMATCH (${detail})`);
      }
    }

    const passMap: Partial<Record<DisplayModeId, boolean>> = {};
    for (const [m, r] of Object.entries(modeResults)) {
      if (!r || r.detail === 'missing gold' || r.detail === 'capture failed') continue;
      passMap[m as DisplayModeId] = r.pass;
    }
    reports.push({
      map,
      modes: modeResults,
      inferredLayer: inferParityFailureLayer(passMap),
    });
  }

  const reportPath = path.join(OUT, slug, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ slug, modes, reports }, null, 2));

  const fullFails = reports.filter((r) => r.modes.full?.pass === false);
  const layerCounts = new Map<string, number>();
  for (const r of fullFails) {
    layerCounts.set(r.inferredLayer, (layerCounts.get(r.inferredLayer) ?? 0) + 1);
  }

  console.log(`\nResult: ${totalPass}/${maps.length * modes.length} mode-checks pass`);
  console.log(`Full-frame fails: ${fullFails.length}/${maps.length}`);
  if (layerCounts.size) {
    console.log('\nInferred failure layers (full-frame fails only):');
    for (const [layer, n] of [...layerCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${layer}: ${n} maps`);
    }
  }

  if (fullFails.length) {
    console.log('\nSample failing maps (map → layer → mode results):');
    for (const r of fullFails.slice(0, 12)) {
      const bits = modes
        .map((m) => `${m}:${r.modes[m]?.pass ? 'ok' : 'FAIL'}`)
        .join(' ');
      console.log(`  ${r.map} → ${r.inferredLayer} [${bits}]`);
    }
  }

  console.log(`\nReport: ${reportPath}`);
  if (totalFail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
