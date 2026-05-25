import { describe, expect, it } from 'vitest';
import { buildSectorTriangleHash, findSectorAt } from '@/wad/renderer/utils/sectorLookup';
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
});
