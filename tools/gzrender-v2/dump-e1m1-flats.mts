#!/usr/bin/env tsx
import fs from 'node:fs';
import { loadWadFromArrayBuffer } from '../../src/wad/parser/loadWadFromArrayBuffer.ts';

const buf = fs.readFileSync('public/wads/DOOM.WAD');
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = (wad as any).maps.E1M1;

const counts = new Map<string, { n: number; minF: number; maxF: number }>();
for (const s of map.SECTORS) {
  const f = String(s.floorpic).toUpperCase();
  const e = counts.get(f) ?? { n: 0, minF: Infinity, maxF: -Infinity };
  e.n++;
  e.minF = Math.min(e.minF, s.floorheight);
  e.maxF = Math.max(e.maxF, s.floorheight);
  counts.set(f, e);
}
console.log('E1M1 distinct floor flats (flat, #sectors, floorH range):');
for (const [f, e] of [...counts.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${f.padEnd(10)} sectors=${String(e.n).padStart(3)} floorH=[${e.minF}..${e.maxF}]`);
}
