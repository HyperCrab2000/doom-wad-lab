#!/usr/bin/env npx tsx
/**
 * Generate canonical GZDoom gold-standard artifacts for every stock map:
 *   artifacts/gzrender-v2/gold-standard/<IWAD>/<MAP>/gzdoom.gzstate
 *   artifacts/gzrender-v2/gold-standard/<IWAD>/<MAP>/ref.png
 *
 * These come from native GZDoom (WAD load, -gzrender_only) — the oracle for
 * GZSTATE bytes and spawn frame pixels before browser WASM exists.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/dump-gzdoom-gold-standard.mts [iwad] [--maps E1M1]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { discoverMapNames, loadWadFromArrayBuffer } from '@hypercrab2000/doom-wad-core';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CAPTURE = path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-ref-frame.sh');
const OUT_ROOT = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');

function parseArgs(argv: string[]) {
  let iwad = path.join(ROOT, 'public/wads/DOOM.WAD');
  let mapFilter: string[] | undefined;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--maps') mapFilter = argv[++i]?.split(',').map((s) => s.trim().toUpperCase());
    else if (!arg.startsWith('-')) iwad = path.resolve(arg);
  }
  return { iwad, mapFilter };
}

function runCapture(iwad: string, map: string, gzstate: string, png: string): void {
  const res = spawnSync('bash', [CAPTURE, iwad, map, gzstate, png], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`capture failed for ${map} (exit ${res.status})`);
  }
}

async function main() {
  const { iwad, mapFilter } = parseArgs(process.argv);
  if (!fs.existsSync(iwad)) {
    console.error(`IWAD not found: ${iwad}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(iwad);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  let maps = discoverMapNames(wad);
  if (mapFilter?.length) maps = maps.filter((m) => mapFilter.includes(m));

  const slug = path.basename(iwad, path.extname(iwad)).toUpperCase();
  const outDir = path.join(OUT_ROOT, slug);
  fs.mkdirSync(outDir, { recursive: true });

  const manifest: Array<{ map: string; gzstateBytes: number; frameBytes: number }> = [];
  let pass = 0;

  console.log(`GZDoom gold standard: ${slug} — ${maps.length} maps → ${outDir}`);

  for (const map of maps) {
    const mapDir = path.join(outDir, map);
    fs.mkdirSync(mapDir, { recursive: true });
    const gzstate = path.join(mapDir, 'gzdoom.gzstate');
    const png = path.join(mapDir, 'ref.png');

    process.stdout.write(`  [${map}] ...`);
    runCapture(iwad, map, gzstate, png);
    const gzBytes = fs.statSync(gzstate).size;
    const pngBytes = fs.statSync(png).size;
    manifest.push({ map, gzstateBytes: gzBytes, frameBytes: pngBytes });
    pass++;
    process.stdout.write(` ok (${gzBytes} B state, ${pngBytes} B frame)\n`);
  }

  const summary = {
    iwad: slug,
    source: 'gzdoom-native',
    flags: ['-gzrender_only', '-dumpgzstate', '-gzstate_refframe'],
    maps: maps.length,
    pass,
    generatedAt: new Date().toISOString(),
    manifest,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(summary, null, 2));
  console.log(`\nDone: ${pass}/${maps.length} maps → ${outDir}/manifest.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
