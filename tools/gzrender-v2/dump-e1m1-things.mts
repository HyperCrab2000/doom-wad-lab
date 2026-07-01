#!/usr/bin/env tsx
import fs from 'node:fs';
import { loadWadFromArrayBuffer } from '../../src/wad/parser/loadWadFromArrayBuffer.ts';

const wad = loadWadFromArrayBuffer(fs.readFileSync('public/wads/DOOM.WAD').buffer);
const map = wad.maps.E1M1!;
for (const [i, t] of map.THINGS.entries()) {
  if (Math.hypot(t.x - 1056, t.y - (-3616)) < 1200) {
    console.log(`#${i} type=${t.type} x=${t.x} y=${t.y} angle=${t.angle}`);
  }
}
