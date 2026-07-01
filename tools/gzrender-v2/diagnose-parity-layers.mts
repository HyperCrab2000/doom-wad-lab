#!/usr/bin/env npx tsx
/**
 * Quick layer diagnosis for maps failing full-frame parity.
 * Runs display-mode corpus on failing maps only and prints actionable buckets.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/diagnose-parity-layers.mts [--maps E1M6,E1M1]
 *
 * If --maps omitted, reads latest gzdoom-wasm-corpus failures or runs E1M6 canary.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  DISPLAY_MODE_CORPUS_ORDER,
  inferParityFailureLayer,
  type DisplayModeId,
} from '../../src/gzdoom-oracle/parityDisplayModes.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CORPUS = path.join(ROOT, 'tools/gzrender-v2/display-mode-corpus.mts');

function parseMaps(argv: string[]): string[] | undefined {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--maps') {
      return argv[++i]?.split(',').map((s) => s.trim().toUpperCase());
    }
  }
  return undefined;
}

function defaultCanaryMaps(): string[] {
  return ['E1M6', 'E1M1', 'MAP03'];
}

async function main() {
  const maps = parseMaps(process.argv) ?? defaultCanaryMaps();
  const mapArg = maps.join(',');

  console.log(`Diagnose parity layers — maps: ${mapArg}\n`);

  for (const iwad of ['DOOM.WAD', 'DOOM2.WAD']) {
    const iwadPath = path.join(ROOT, 'public/wads', iwad);
    if (!fs.existsSync(iwadPath)) continue;

    const slug = iwad.replace('.WAD', '');
    const relevant = maps.filter((m) =>
      slug === 'DOOM2' ? m.startsWith('MAP') : m.startsWith('E'),
    );
    if (!relevant.length) continue;

    console.log(`=== ${slug} (${relevant.join(', ')}) ===`);
    const res = spawnSync(
      'npx',
      ['tsx', CORPUS, iwadPath, '--maps', relevant.join(','), '--modes', DISPLAY_MODE_CORPUS_ORDER.join(',')],
      { cwd: ROOT, stdio: 'inherit', env: process.env },
    );

    const reportPath = path.join(ROOT, 'artifacts/gzrender-v2/display-mode-corpus', slug, 'report.json');
    if (!fs.existsSync(reportPath)) continue;

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
      reports: Array<{
        map: string;
        inferredLayer: string;
        modes: Partial<Record<DisplayModeId, { pass: boolean; detail: string }>>;
      }>;
    };

    for (const r of report.reports) {
      if (r.modes.full?.pass) {
        console.log(`  ${r.map}: FULL PASS`);
        continue;
      }
      console.log(`  ${r.map}: layer=${r.inferredLayer}`);
      for (const mode of DISPLAY_MODE_CORPUS_ORDER) {
        const m = r.modes[mode];
        if (!m) continue;
        console.log(`    ${mode.padEnd(12)} ${m.pass ? 'PASS' : 'FAIL'} ${m.detail}`);
      }
    }
    console.log('');

    if (res.status !== 0) {
      process.exit(res.status ?? 1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
