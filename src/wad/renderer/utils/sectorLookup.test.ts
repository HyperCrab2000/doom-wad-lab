import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { getSectorLineGeometry } from '@/wad/renderer/geometry/getLineDefsBySector';
import { sectorLinesToTriangles } from '@/wad/renderer/geometry/sectorLinesToTriangles';
import {
  buildSectorTriangleHash,
  findSectorAt,
  findSectorAtPoint,
} from '@/wad/renderer/utils/sectorLookup';
import { WadMap } from '@/wad/interfaces/WadMap';
import { Triangle } from '@/wad/interfaces/Triangle';

describe('sectorLookup', () => {
  it('finds sectors using triangle hash instead of broken Record.length iteration', () => {
    const map = {
      SECTORS: [{ floorheight: 0, ceilingheight: 128 }],
      LINEDEFS: [],
      VERTEXES: [],
      SIDEDEFS: [],
    } as unknown as WadMap;

    const triangle: Triangle = [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
    ];

    const sectorTriangles = { 0: [triangle] };
    const triangleHash = buildSectorTriangleHash(map, sectorTriangles);

    expect(findSectorAt(map, sectorTriangles, triangleHash, { x: 32, y: 32 })).toBe(map.SECTORS[0]);
    expect(findSectorAt(map, sectorTriangles, null, { x: 32, y: 32 })).toBe(map.SECTORS[0]);
  });

  it('builds a hash with entries for every triangle in every sector', () => {
    const map = twoSectorMap();
    const sectorTriangles = {
      0: [triangle(0, 0, 64, 0, 64, 64)],
      1: [triangle(64, 0, 128, 0, 128, 64), triangle(64, 0, 128, 64, 64, 64)],
    };
    const hash = buildSectorTriangleHash(map, sectorTriangles);

    expect(hash.x.length).toBeGreaterThanOrEqual(4);
    expect(hash.y.length).toBeGreaterThanOrEqual(4);
  });

  it('findSectorAtPoint does not use nearest-sector fallback', () => {
    const map = twoSectorMap();
    const sectorTriangles = {
      0: [triangle(0, 0, 64, 0, 64, 64)],
      1: [triangle(64, 0, 128, 0, 128, 64)],
    };
    const hash = buildSectorTriangleHash(map, sectorTriangles);

    expect(findSectorAtPoint(map, sectorTriangles, null, { x: 32, y: -16 })).toBeNull();
    expect(findSectorAtPoint(map, sectorTriangles, hash, { x: 96, y: 16 })).toBe(map.SECTORS[1]);
    expect(findSectorAt(map, sectorTriangles, null, { x: 32, y: -16 })).toBe(map.SECTORS[0]);
  });

  it('falls back to the nearest sector when the point is outside all triangles', () => {
    const map = twoSectorMap();
    const sectorTriangles = {
      0: [triangle(0, 0, 64, 0, 64, 64)],
      1: [triangle(64, 0, 128, 0, 128, 64)],
    };

    const nearest = findSectorAt(map, sectorTriangles, null, { x: 32, y: -16 });
    expect(nearest).toBe(map.SECTORS[0]);
  });

  it('prefers the hash path over the linear sector scan', () => {
    const map = twoSectorMap();
    const sectorTriangles = {
      0: [triangle(0, 0, 64, 0, 64, 64)],
      1: [triangle(64, 0, 128, 0, 128, 64)],
    };
    const hash = buildSectorTriangleHash(map, sectorTriangles);

    expect(findSectorAt(map, sectorTriangles, hash, { x: 96, y: 16 })).toBe(map.SECTORS[1]);
  });

  it('finds the player-start sector in real E1M1 data', () => {
    const map = loadE1M1();
    const sectorTriangles = buildSectorTriangles(map);
    const hash = buildSectorTriangleHash(map, sectorTriangles);

    const sector = findSectorAt(map, sectorTriangles, hash, { x: -992, y: 3616 });
    expect(sector).toBeTruthy();
    expect(map.SECTORS.indexOf(sector!)).toBeGreaterThanOrEqual(0);
  });
});

function triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): Triangle {
  return [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    { x: x3, y: y3 },
  ];
}

function twoSectorMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 128, y: 0 },
    ],
    SECTORS: [{ floorheight: 0, ceilingheight: 128 }, { floorheight: 0, ceilingheight: 128 }],
    SIDEDEFS: [{ sector: 0 }, { sector: 1 }],
    LINEDEFS: [{ v1: 0, v2: 1, sidenum: [0, 1] }, { v1: 1, v2: 2, sidenum: [0, 1] }],
  } as unknown as WadMap;
}

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

function buildSectorTriangles(map: ReturnType<typeof loadE1M1>) {
  const linesBySector = getSectorLineGeometry(map);
  const sectorTriangles: Record<number, Triangle[]> = {};

  for (const [key, lines] of Object.entries(linesBySector)) {
    try {
      sectorTriangles[Number(key)] = sectorLinesToTriangles(map, lines);
    } catch {
      // skip malformed sectors
    }
  }

  return sectorTriangles;
}
