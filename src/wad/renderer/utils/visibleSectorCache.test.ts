import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { VisibleSectorCache } from './visibleSectorCache';

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

describe('VisibleSectorCache', () => {
  it('reuses the set when the camera barely moves', () => {
    const map = loadE1M1();
    const index = buildSectorVisibilityIndex(map)!;
    const cache = new VisibleSectorCache();
    const a = cache.getVisibleSectors(index, map, -1088, -3616, 70);
    const b = cache.getVisibleSectors(index, map, -1080, -3610, 70);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
  });

  it('rebuilds after a sector change', () => {
    const map = loadE1M1();
    const index = buildSectorVisibilityIndex(map)!;
    const cache = new VisibleSectorCache();
    const a = cache.getVisibleSectors(index, map, -1088, -3616, 70);
    const b = cache.getVisibleSectors(index, map, -512, -2560, 71);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b).not.toBe(a);
    expect(b!.has(71)).toBe(true);
  });
});
