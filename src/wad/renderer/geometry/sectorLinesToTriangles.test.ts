import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { WadMap } from '@/wad/interfaces/WadMap';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { getSectorLineGeometry } from '@/wad/renderer/geometry/getLineDefsBySector';
import { sectorLinesToTriangles } from '@/wad/renderer/geometry/sectorLinesToTriangles';
import { pointInTriangle } from '@/wad/utils/pointInTriangle';

describe('sectorLinesToTriangles', () => {
  it('triangulates a simple square sector into two triangles', () => {
    const map = squareRoomMap();
    const lines = getSectorLineGeometry(map)[0];

    const triangles = sectorLinesToTriangles(map, lines);

    expect(triangles.length).toBeGreaterThan(0);
    expect(pointInTriangle({ x: 32, y: 32 }, triangles[0]) || pointInTriangle({ x: 32, y: 32 }, triangles[1] ?? triangles[0])).toBe(
      true
    );
  });

  it('deduplicates repeated boundary lines before triangulation', () => {
    const map = squareRoomMap();
    const lines = getSectorLineGeometry(map)[0];
    const duplicated = [...lines, ...lines];

    expect(sectorLinesToTriangles(map, duplicated)).toEqual(sectorLinesToTriangles(map, lines));
  });

  it('triangulates real E1M1 player-start sector', () => {
    const map = loadE1M1();
    const startSector = map.SECTORS.findIndex((sector) => sector.floorheight === 0 && sector.ceilingheight === 128);
    expect(startSector).toBeGreaterThanOrEqual(0);

    const lines = getSectorLineGeometry(map)[startSector];
    expect(lines?.length).toBeGreaterThan(2);

    const triangles = sectorLinesToTriangles(map, lines);
    expect(triangles.length).toBeGreaterThan(0);
    expect(triangles.every((triangle) => triangle.length === 3)).toBe(true);
  });
});

function squareRoomMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
      { x: 0, y: 64 },
    ],
    SECTORS: [{ floorheight: 0, ceilingheight: 128 }],
    SIDEDEFS: [{ sector: 0 }],
    LINEDEFS: [
      { v1: 0, v2: 1, sidenum: [-1, 0] },
      { v1: 1, v2: 2, sidenum: [-1, 0] },
      { v1: 2, v2: 3, sidenum: [-1, 0] },
      { v1: 3, v2: 0, sidenum: [-1, 0] },
    ],
  } as unknown as WadMap;
}

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}
