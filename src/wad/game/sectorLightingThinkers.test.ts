import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@hypercrab2000/doom-wad-core';

import { MapActionController } from './mapActionController';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const IWAD = path.join(ROOT, 'public/wads/DOOM.WAD');
const TIC_SECONDS = 1 / 35;

function loadE1M1() {
  const raw = fs.readFileSync(IWAD);
  const wad = loadWadFromArrayBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  return structuredClone(wad.maps.E1M1!);
}

describe('SectorLightingThinkerSystem', () => {
  it('matches GZDoom passive lighting on E1M1 after 35 tics', () => {
    const map = loadE1M1();
    const controller = new MapActionController(map);

    for (let tick = 0; tick < 35; tick++) {
      controller.tick(TIC_SECONDS);
    }

    expect(map.SECTORS[35].lightlevel).toBe(215);
    expect(map.SECTORS[36].lightlevel).toBe(215);
    expect(map.SECTORS[64].lightlevel).toBe(128);
  });
});
