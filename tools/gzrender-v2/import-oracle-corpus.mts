#!/usr/bin/env npx tsx
/**
 * Stage 3 corpus — GZDoom WAD-load ref frame ≡ GZDoom -loadgzstate import frame (0% diff).
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/import-oracle-corpus.mts [iwad] [--maps E1M1,MAP01]
 *
 * Requires built GZDoom (tools/gzrender-v2/build-gzdoom.sh).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { discoverMapNames } from '@hypercrab2000/doom-wad-core';

import { diffPlayfieldPngFiles, formatFrameDiff } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CAPTURE_REF = path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-ref-frame.sh');
const CAPTURE_IMPORT = path.join(ROOT, 'tools/gzrender-v2/capture-gzstate-import-frame.sh');
const EXPORT_NODE = path.join(ROOT, 'tools/gzrender-v2/export-node-gzstate.mts');
const ARTIFACTS = path.join(ROOT, 'artifacts/gzrender-v2/import-oracle');

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

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): void {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${res.status})`);
  }
}

async function main() {
  const { iwad, mapFilter } = parseArgs(process.argv);
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
  fs.mkdirSync(path.join(ARTIFACTS, slug), { recursive: true });

  let pass = 0;
  let fail = 0;
  const failures: string[] = [];

  console.log(`Import oracle corpus: ${slug} — ${maps.length} maps`);

  for (const map of maps) {
    const mapDir = path.join(ARTIFACTS, slug, map);
    fs.mkdirSync(mapDir, { recursive: true });
    const refFrame = path.join(mapDir, 'ref.png');
    const importFrame = path.join(mapDir, 'import.png');
    const gzstate = path.join(mapDir, 'node.gzstate');

    process.stdout.write(`  [${map}] export...`);
    run('npx', ['tsx', EXPORT_NODE, iwad, map, gzstate]);
    process.stdout.write(' ref...');
    run('bash', [CAPTURE_REF, iwad, map, path.join(mapDir, 'ref.gzstate'), refFrame]);
    process.stdout.write(' import...');
    run('bash', [CAPTURE_IMPORT, gzstate, importFrame], { IWAD: iwad });

    const diff = await diffPlayfieldPngFiles(refFrame, importFrame, { tolerance: 0 });
    if (diff.identical) {
      pass++;
      process.stdout.write(` pass (0%)\n`);
    } else {
      fail++;
      failures.push(`${map}: ${formatFrameDiff(diff)}`);
      process.stdout.write(` FAIL ${formatFrameDiff(diff)}\n`);
    }
  }

  const summary = { iwad: slug, maps: maps.length, pass, fail, failures };
  fs.writeFileSync(path.join(ARTIFACTS, slug, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nDone: ${pass}/${maps.length} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
