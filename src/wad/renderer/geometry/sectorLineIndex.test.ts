import { describe, expect, it } from 'vitest';

import { WadMap } from '@/wad/interfaces/WadMap';
import {
  getFlatIndicesForSectors,
  getLineIndicesForSectors,
} from '@/wad/renderer/geometry/sectorLineIndex';

describe('sectorLineIndex', () => {
  it('finds all linedefs touching the requested sectors', () => {
    const map = {
      LINEDEFS: [
        { sidenum: [0, 1] },
        { sidenum: [2, -1] },
        { sidenum: [3, 4] },
      ],
      SIDEDEFS: [{ sector: 0 }, { sector: 1 }, { sector: 2 }, { sector: 3 }, { sector: 4 }],
    } as unknown as WadMap;

    expect([...getLineIndicesForSectors(map, [0])].sort()).toEqual([0]);
    expect([...getLineIndicesForSectors(map, [1, 3])].sort()).toEqual([0, 2]);
  });

  it('returns flat indices for the requested sectors', () => {
    const flats = [
      { sectorIndex: 0 },
      { sectorIndex: 1 },
      { sectorIndex: 0 },
      { sectorIndex: 2 },
    ];

    expect(getFlatIndicesForSectors(flats, [0])).toEqual([0, 2]);
    expect(getFlatIndicesForSectors(flats, [2])).toEqual([3]);
    expect(getFlatIndicesForSectors(flats, [99])).toEqual([]);
  });
});
