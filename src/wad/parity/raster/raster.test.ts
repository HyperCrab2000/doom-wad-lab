import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { crc32 } from '../../../../gzstate/crc32';
import { rasterizeFlat } from './rasterizeFlat';
import { rasterizePatch } from './rasterizePatch';
import { rasterizeTexture } from './rasterizeTexture';

const DOOM_WAD = path.join(process.cwd(), 'public/wads/DOOM.WAD');

function loadDoomWad() {
  if (!fs.existsSync(DOOM_WAD)) return null;
  const raw = fs.readFileSync(DOOM_WAD);
  return loadWadFromArrayBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

describe('palette raster parity helpers', () => {
  it('rasterizes a known patch with stable CRC', () => {
    const wad = loadDoomWad();
    if (!wad) return;

    const lump = wad.lumpHash.WALL00_1;
    expect(lump).toBeTruthy();
    const image = rasterizePatch(lump!, wad.playpal);
    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
    expect(crc32(image.rgba)).toBeTruthy();
  });

  it('rasterizes flats at 64×64', () => {
    const wad = loadDoomWad();
    if (!wad) return;

    const lump = wad.flats.FLOOR0_1;
    expect(lump).toBeTruthy();
    const image = rasterizeFlat(lump!, wad.playpal);
    expect(image.width).toBe(64);
    expect(image.height).toBe(64);
    expect(image.rgba.byteLength).toBe(64 * 64 * 4);
  });

  it('composes wall textures from PNAMES patches', () => {
    const wad = loadDoomWad();
    if (!wad) return;

    const tex = wad.textures.STARTAN3;
    expect(tex).toBeTruthy();
    const image = rasterizeTexture(tex!, wad, wad.playpal);
    expect(image.width).toBe(tex!.texWidth);
    expect(image.height).toBe(tex!.texHeight);
    expect(crc32(image.rgba)).toBeTruthy();
  });
});
