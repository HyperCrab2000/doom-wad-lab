import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { validateWadBuffer } from '@/wad/loader/validateWadBuffer';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import {
  buildMapTextureLookup,
  loadWadFixture,
  loadWadForMap,
  resolveIntegrationWad,
} from './helpers/wadFixtures';

describe('WAD pipeline integration', () => {
  it('loads a repo WAD from disk, validates the header, and parses lump metadata', () => {
    const wadPath = resolveIntegrationWad();
    const bytes = readFileSync(wadPath);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    expect(() => validateWadBuffer(buffer, wadPath)).not.toThrow();

    const wad = loadWadFromArrayBuffer(buffer);
    expect(['IWAD', 'PWAD']).toContain(wad.indentification.trim());
    expect(wad.lumpInfo.length).toBeGreaterThan(100);
    expect(Object.keys(wad.maps).length).toBeGreaterThan(0);
    expect(Object.keys(wad.textures).length).toBeGreaterThan(0);
    expect(Object.keys(wad.flats).length).toBeGreaterThan(0);
  });

  it('rejects the bundled test.wad placeholder when it is not a real archive', () => {
    const placeholderPath = path.resolve(process.cwd(), 'public/wads/test.wad');
    const bytes = readFileSync(placeholderPath);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    expect(bytes.byteLength).toBeLessThan(12);
    expect(() => validateWadBuffer(buffer, placeholderPath)).toThrow(/too small/i);
  });

  it('extracts MAP01 geometry with walls, flats, and sector triangles', () => {
    const { wad, map } = loadWadForMap('MAP01');
    const geometry = buildMapGeometryCpu(map, buildMapTextureLookup(map, wad));

    expect(map.VERTEXES.length).toBeGreaterThan(50);
    expect(map.LINEDEFS.length).toBeGreaterThan(50);
    expect(map.SECTORS.length).toBeGreaterThan(10);
    expect(Object.keys(geometry.sectorTriangles).length).toBeGreaterThan(10);
    expect(geometry.flats.length).toBeGreaterThan(20);
    expect(geometry.walls.length).toBeGreaterThan(20);
    expect(geometry.walls.every((wall) => wall.position.length >= 12)).toBe(true);
  });

  it('indexes music and palette lumps while walking the directory', () => {
    const { wad } = loadWadFixture('public/wads/DOOM2.WAD', 'wads/DOOM2.WAD');

    expect(wad.lumpHash.D_RUNNIN?.byteLength ?? 0).toBeGreaterThan(1000);
    expect(wad.playpal.length).toBeGreaterThan(0);
    expect(wad.maps.MAP01).toBeDefined();
  });
});
