#!/usr/bin/env npx tsx
/**
 * Round-trip the IWAD through the same Node encoder GZDoom play uses (loadWadFromArrayBuffer →
 * encodeWadToArrayBuffer) and compare specific picture lumps byte-for-byte. If STBAR / patches
 * differ or vanish, the re-encode is corrupting graphics — the likely cause of the black status
 * bar and "missing textures".
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadWadFromArrayBuffer, encodeWadToArrayBuffer } from '@hypercrab2000/doom-wad-core';

const IWAD = process.env.IWAD ?? path.resolve(import.meta.dirname, '../../public/wads/DOOM.WAD');
const PROBES = ['STBAR', 'STFST01', 'STTNUM0', 'TITLEPIC', 'NUKAGE1', 'FLOOR4_8', 'TROO A1', 'PLAYPAL'];

function lumpMap(wad: any): Map<string, Uint8Array> {
  const m = new Map<string, Uint8Array>();
  // doom-wad-core exposes lumps via lumpInfo + a way to read bytes; use lumpHash if present.
  if (wad.lumpHash) {
    for (const [k, v] of Object.entries(wad.lumpHash)) {
      m.set(k, new Uint8Array(v as ArrayBuffer));
    }
  }
  return m;
}

function main(): void {
  const raw = fs.readFileSync(IWAD);
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const orig = loadWadFromArrayBuffer(ab.slice(0));
  const encoded = encodeWadToArrayBuffer(orig);
  const round = loadWadFromArrayBuffer((encoded as ArrayBuffer).slice(0));

  console.log(`IWAD: ${IWAD}`);
  console.log(`orig bytes: ${raw.byteLength}  encoded bytes: ${(encoded as ArrayBuffer).byteLength}`);
  console.log(`orig lumps: ${orig.lumpInfo?.length}  round lumps: ${round.lumpInfo?.length}`);

  const a = lumpMap(orig);
  const b = lumpMap(round);

  for (const name of PROBES) {
    const x = a.get(name);
    const y = b.get(name);
    if (!x && !y) {
      console.log(`${name.padEnd(10)} : ABSENT in both`);
      continue;
    }
    if (!x || !y) {
      console.log(`${name.padEnd(10)} : present orig=${!!x} round=${!!y}  <-- LOST`);
      continue;
    }
    let firstDiff = -1;
    const n = Math.max(x.length, y.length);
    for (let i = 0; i < n; i++) {
      if (x[i] !== y[i]) { firstDiff = i; break; }
    }
    const status = x.length === y.length && firstDiff === -1 ? 'IDENTICAL' : `DIFF@${firstDiff}`;
    console.log(`${name.padEnd(10)} : orig=${x.length}b round=${y.length}b  ${status}`);
  }
}

main();
