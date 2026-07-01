#!/usr/bin/env npx tsx
/** Write Node exportToGzstate → writeGzstate (full WAD data incl. REJECT/BLOCKMAP) for GZDoom -loadgzstate. */
import fs from 'node:fs';
import path from 'node:path';

import { discoverMapNames, exportToGzstate, loadWadFromArrayBuffer, writeGzstate } from '@hypercrab2000/doom-wad-core';

const ROOT = path.resolve(import.meta.dirname, '../..');
const iwad = process.argv[2] ?? path.join(ROOT, 'public/wads/DOOM.WAD');
const mapName = (process.argv[3] ?? 'E1M1').toUpperCase();
const outPath = process.argv[4] ?? path.join(ROOT, `artifacts/gzrender-v2/node-export/${mapName}.gzstate`);

if (!fs.existsSync(iwad)) {
  console.error(`IWAD not found: ${iwad}`);
  process.exit(1);
}

const buf = fs.readFileSync(iwad);
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const maps = discoverMapNames(wad);
if (!maps.includes(mapName)) {
  console.error(`Map ${mapName} not in ${path.basename(iwad)}`);
  process.exit(1);
}

const doc = exportToGzstate(wad, mapName);
const bytes = writeGzstate(doc);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.from(bytes));
console.log(`Wrote ${outPath} (${bytes.byteLength} bytes, reject=${doc.mapReject?.byteLength ?? 0}, blockmap=${doc.mapBlockmapRaw?.byteLength ?? 0})`);
