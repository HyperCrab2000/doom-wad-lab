import { describe, expect, it } from 'vitest';

import { WadMap } from '@/wad/interfaces/WadMap';
import { getLineDefsBySector, getSectorLineGeometry } from '@/wad/renderer/geometry/getLineDefsBySector';

describe('getLineDefsBySector', () => {
  it('registers boundary lines once per sector with correct winding', () => {
    const map = squareRoomMap();
    const bySector = getLineDefsBySector(map);

    expect(bySector[0]).toHaveLength(4);
    expect(bySector[0].map((line) => `${line.v1}->${line.v2}`)).toEqual([
      '0->1',
      '1->2',
      '2->3',
      '3->0',
    ]);
  });

  it('registers both sides of a two-sided portal with opposite winding', () => {
    const map = twoRoomMap();
    const bySector = getLineDefsBySector(map);

    expect(bySector[0]).toHaveLength(1);
    expect(bySector[1]).toHaveLength(1);
    expect(bySector[0][0]).toEqual({ v1: 0, v2: 1 });
    expect(bySector[1][0]).toEqual({ v1: 1, v2: 0 });
  });

  it('ignores same-sector two-sided lines', () => {
    const map = sameSectorTwoSidedMap();
    const bySector = getLineDefsBySector(map);

    expect(bySector[0]).toBeUndefined();
  });

  it('matches getSectorLineGeometry output', () => {
    const map = squareRoomMap();
    expect(getSectorLineGeometry(map)).toEqual(getLineDefsBySector(map));
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
      { v1: 0, v2: 1, sidenum: [0, -1] },
      { v1: 1, v2: 2, sidenum: [0, -1] },
      { v1: 2, v2: 3, sidenum: [0, -1] },
      { v1: 3, v2: 0, sidenum: [0, -1] },
    ],
  } as unknown as WadMap;
}

function twoRoomMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    SECTORS: [{ floorheight: 0, ceilingheight: 128 }, { floorheight: 0, ceilingheight: 128 }],
    SIDEDEFS: [{ sector: 0 }, { sector: 1 }],
    LINEDEFS: [{ v1: 0, v2: 1, sidenum: [0, 1] }],
  } as unknown as WadMap;
}

function sameSectorTwoSidedMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    SECTORS: [{ floorheight: 0, ceilingheight: 128 }],
    SIDEDEFS: [{ sector: 0 }, { sector: 0 }],
    LINEDEFS: [{ v1: 0, v2: 1, sidenum: [0, 1] }],
  } as unknown as WadMap;
}
