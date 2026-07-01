#!/usr/bin/env npx tsx
/**
 * Regenerate layered gold-standard ref PNGs from native GLES (+vid_preferbackend 2).
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/regenerate-gold-display-modes.mts [iwad] [--maps E1M1] [--modes notexture,geometry]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { discoverMapNames } from '@hypercrab2000/doom-wad-core';

import {
  DISPLAY_MODE_CORPUS_ORDER,
  displayModeRefFilename,
  parseDisplayModeId,
  type DisplayModeId,
} from '../../src/gzdoom-oracle/parityDisplayModes.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CAPTURE = path.join(ROOT, 'tools/gzrender-v2/capture-gzstate-import-frame.sh');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');

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

async function main() {
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
  let ok = 0;
  let fail = 0;

  console.log(`Regenerate display-mode gold: ${slug} — ${maps.length} maps × ${modes.length} modes`);

  for (const map of maps) {
    const gzstate = path.join(GOLD, slug, map, 'gzdoom.gzstate');
    if (!fs.existsSync(gzstate)) {
      console.error(`  [${map}] SKIP — missing ${gzstate}`);
      fail += modes.length;
      continue;
    }

    for (const mode of modes) {
      const refPng = path.join(GOLD, slug, map, displayModeRefFilename(mode));
      process.stdout.write(`  [${map}/${mode}] native GLES...`);
      const res = spawnSync('bash', [CAPTURE, gzstate, refPng, mode], {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, GZDOOM_TIMEOUT: process.env.GZDOOM_TIMEOUT ?? '120' },
      });
      if (res.status !== 0) {
        fail++;
        console.log(' FAIL');
        const err = (res.stderr?.toString() || res.stdout?.toString() || '').trim().slice(-120);
        console.error(`    ${err}`);
        continue;
      }
      ok++;
      console.log(' OK');
    }
  }

  console.log(`\nDone: ${ok} ok, ${fail} fail`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
