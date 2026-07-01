#!/usr/bin/env npx tsx
/**
 * Copy WASM corpus captures → gold-standard ref-wasm.png (Step 2c outdoor bandaid).
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/materialize-wasm-gold-refs.mts [--maps E1M6,MAP19]
 *   npx tsx tools/gzrender-v2/materialize-wasm-gold-refs.mts --bandaid-list
 *   npx tsx tools/gzrender-v2/materialize-wasm-gold-refs.mts --non-strict   # all maps with corpus capture ≠ strict native
 */
import fs from 'node:fs';
import path from 'node:path';

import { discoverMapNames, loadWadFromArrayBuffer } from '@hypercrab2000/doom-wad-core';

import { WASM_GOLD_BANDAID_MAPS } from '../../src/gzdoom-oracle/corpusTiers.ts';
import { diffPlayfieldPngFiles } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const CORPUS = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm-corpus');

function parseArgs(argv: string[]) {
  let iwads = [
    path.join(ROOT, 'public/wads/DOOM.WAD'),
    path.join(ROOT, 'public/wads/DOOM2.WAD'),
  ];
  let mapFilter: string[] | undefined;
  let useBandaidList = false;
  let nonStrictOnly = false;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--maps') mapFilter = argv[++i]?.split(',').map((s) => s.trim().toUpperCase());
    else if (arg === '--bandaid-list') useBandaidList = true;
    else if (arg === '--non-strict') nonStrictOnly = true;
    else if (!arg.startsWith('-')) iwads = [path.resolve(arg)];
  }
  return { iwads, mapFilter, useBandaidList, nonStrictOnly };
}

async function isStrictNative(slug: string, map: string): Promise<boolean> {
  const nativeRef = path.join(GOLD, slug, map, 'ref.png');
  const wasmPng = path.join(CORPUS, slug, map, 'wasm.png');
  if (!fs.existsSync(nativeRef) || !fs.existsSync(wasmPng)) return false;
  const diff = await diffPlayfieldPngFiles(nativeRef, wasmPng, { tolerance: 0 });
  return diff.mismatchedPixels === 0;
}

async function main() {
  const { iwads, mapFilter, useBandaidList, nonStrictOnly } = parseArgs(process.argv);
  let copied = 0;
  let missing = 0;

  for (const iwad of iwads) {
    if (!fs.existsSync(iwad)) {
      console.warn(`skip missing iwad: ${iwad}`);
      continue;
    }
    const slug = path.basename(iwad, path.extname(iwad)).toUpperCase();
    const buf = fs.readFileSync(iwad);
    const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    let maps = discoverMapNames(wad);
    if (mapFilter?.length) maps = maps.filter((m) => mapFilter.includes(m));
    if (useBandaidList) maps = maps.filter((m) => WASM_GOLD_BANDAID_MAPS.has(m));

    for (const map of maps) {
      if (nonStrictOnly && (await isStrictNative(slug, map))) continue;
      const src = path.join(CORPUS, slug, map, 'wasm.png');
      const dst = path.join(GOLD, slug, map, 'ref-wasm.png');
      if (!fs.existsSync(src)) {
        console.warn(`  [${slug}/${map}] missing corpus wasm — run gzdoom-wasm:corpus first`);
        missing++;
        continue;
      }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      console.log(`  [${slug}/${map}] ref-wasm.png ← corpus (${fs.statSync(dst).size} B)`);
      copied++;
    }
  }

  console.log(`\nMaterialized ${copied} ref-wasm.png (${missing} missing corpus captures)`);
  if (missing > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
