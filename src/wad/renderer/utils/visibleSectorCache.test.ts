import { describe, expect, it } from 'vitest';
import { VisibleSectorCache } from './visibleSectorCache';
import type { SectorVisibilityIndex } from './sectorVisibility';

describe('VisibleSectorCache', () => {
  const index = {
    subsectorToSector: [0, 1],
    sectorBounds: [
      { minX: 0, maxX: 64, minY: 0, maxY: 64 },
      { minX: 64, maxX: 128, minY: 0, maxY: 64 },
    ],
    sectorAdjacency: [[1], [0]],
  } satisfies SectorVisibilityIndex;

  const map = {
    SECTORS: [{}, {}],
    LINEDEFS: [
      {
        v1: 0,
        v2: 1,
        sidenum: [0, 1],
        flags: { twoSided: true },
      },
    ],
    SIDEDEFS: [{ sector: 0 }, { sector: 1 }],
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
  } as unknown as import('@/wad/interfaces/WadMap').WadMap;

  it('reuses the set when the camera barely moves', () => {
    const cache = new VisibleSectorCache();
    const a = cache.getVisibleSectors(index, map, 16, 16, 0);
    const b = cache.getVisibleSectors(index, map, 20, 18, 0);
    expect(b).toBe(a);
  });

  it('rebuilds after a sector change', () => {
    const cache = new VisibleSectorCache();
    const a = cache.getVisibleSectors(index, map, 16, 16, 0);
    const b = cache.getVisibleSectors(index, map, 80, 16, 1);
    expect(b).not.toBe(a);
    expect(b.has(1)).toBe(true);
  });
});
