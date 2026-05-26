import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';

describe('buildMapGeometryCpu', () => {
  it('builds flats, walls, and sector triangles for E1M1', () => {
    const map = loadE1M1();
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));

    expect(Object.keys(geometry.sectorTriangles).length).toBeGreaterThan(50);
    expect(geometry.flats.length).toBeGreaterThan(100);
    expect(geometry.walls.length).toBeGreaterThan(100);
    expect(Object.values(geometry.sectorTriangles).every((triangles) => triangles.length > 0)).toBe(true);
  });

  it('produces deterministic geometry for the same map input', () => {
    const map = loadE1M1();
    const textures = buildTextureLookup(map);
    const first = buildMapGeometryCpu(map, textures);
    const second = buildMapGeometryCpu(map, textures);

    expect(Object.keys(first.sectorTriangles).length).toBe(Object.keys(second.sectorTriangles).length);
    expect(first.flats.length).toBe(second.flats.length);
    expect(first.walls.length).toBe(second.walls.length);
  });

  it('includes floor and ceiling flats for each triangulated sector', () => {
    const map = loadE1M1();
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
    const sectorWithFlats = geometry.flats.reduce<Record<number, number>>((acc, flat) => {
      acc[flat.sectorIndex] = (acc[flat.sectorIndex] ?? 0) + 1;
      return acc;
    }, {});

    expect(Object.values(sectorWithFlats).some((count) => count >= 2)).toBe(true);
  });
});

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

function buildTextureLookup(map: ReturnType<typeof loadE1M1>) {
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }
  const texturesByName: Record<string, { name: string; width: number; height: number; transparent: boolean; graphics: never }> = {};
  for (const name of texNames) {
    texturesByName[name] = { name, width: 64, height: 128, transparent: false, graphics: {} as never };
  }
  return texturesByName;
}
