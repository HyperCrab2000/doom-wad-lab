import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import {
  buildPortalVisibleSectors,
  buildPotentiallyVisibleSectors,
  buildSectorAdjacency,
  buildSectorVisibilityIndex,
  enrichSectorBoundsFromTriangles,
  finalizeSectorVisibilityIndex,
  findCameraSectorIndex,
  findCameraSubsector,
  getLineSectorIndices,
  isDrawVisible,
  isSectorPotentiallyVisible,
  isSkySector,
} from './sectorVisibility';

function emptyIndex(sectorCount: number, bounds: Array<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} | null> = []) {
  return {
    subsectorToSector: [],
    sectorBounds: Array.from({ length: sectorCount }, (_, i) => bounds[i] ?? null),
    sectorAdjacency: Array.from({ length: sectorCount }, () => [] as number[]),
  };
}

describe('sector visibility culling', () => {
  it('keeps the camera sector floor visible even when its center is far away', () => {
    const visible = buildPotentiallyVisibleSectors(
      emptyIndex(1, [{ minX: 0, maxX: 4096, minY: 0, maxY: 4096 }]),
      { SECTORS: [{} as Sector] } as WadMap,
      512,
      512,
      0
    );

    const cameraPos: [number, number, number] = [512, 41, -512];
    const farFlatCenter: [number, number, number] = [3584, 0, -3584];

    expect(
      isDrawVisible(farFlatCenter, cameraPos, 2200, visible, 0, 0, true)
    ).toBe(true);
  });

  it('includes sectors with missing line bounds once triangle bounds are enriched', () => {
    const index = emptyIndex(2, [null, { minX: 1000, maxX: 2000, minY: 1000, maxY: 2000 }]);

    enrichSectorBoundsFromTriangles(index, {
      0: [[{ x: 128, y: 128 }, { x: 256, y: 128 }, { x: 128, y: 256 }]],
    });

    const visible = buildPotentiallyVisibleSectors(
      index,
      { SECTORS: [{}, {}] } as WadMap,
      160,
      160,
      0,
      200
    );

    expect(visible.has(0)).toBe(true);
    expect(visible.has(1)).toBe(false);
  });

  it('includes vertically stacked sectors connected by a portal', () => {
    const footprint = { minX: 100, maxX: 200, minY: 100, maxY: 200 };
    const visible = buildPortalVisibleSectors(
      {
        subsectorToSector: [],
        sectorBounds: [footprint, footprint],
        sectorAdjacency: [[1], [0]],
      },
      { SECTORS: [{}, {}] } as WadMap,
      150,
      150,
      0,
      64
    );

    expect(visible.has(0)).toBe(true);
    expect(visible.has(1)).toBe(true);
  });

  it('does not include sectors separated by one-sided walls', () => {
    const map = {
      SECTORS: [{}, {}],
      LINEDEFS: [{ sidenum: [0, -1], v1: 0, v2: 1 }],
      SIDEDEFS: [{ sector: 0 }],
      VERTEXES: [
        { x: 0, y: 0 },
        { x: 64, y: 0 },
      ],
    } as unknown as WadMap;

    const index = {
      subsectorToSector: [],
      sectorBounds: [
        { minX: 0, maxX: 64, minY: 0, maxY: 64 },
        { minX: 64, maxX: 128, minY: 0, maxY: 64 },
      ],
      sectorAdjacency: buildSectorAdjacency(map),
    };

    const visible = buildPortalVisibleSectors(index, map, 32, 32, 0, 512);
    expect(visible.has(0)).toBe(true);
    expect(visible.has(1)).toBe(false);
  });

  it('still distance-culls sectors in the portal-visible set', () => {
    const visible = new Set([2]);
    const farCenter: [number, number, number] = [5000, 0, -5000];

    expect(
      isDrawVisible(farCenter, [0, 41, 0], 2200, visible, 2, -1, true)
    ).toBe(false);
  });

  it('still distance-culls when no visibility set is available', () => {
    const farCenter: [number, number, number] = [5000, 0, -5000];

    expect(
      isDrawVisible(farCenter, [0, 41, 0], 2200, null, 0, -1, true)
    ).toBe(false);
  });

  it('does not leak distant indoor sectors into sky views from an indoor camera', () => {
    const indoor = { floorpic: 'FLOOR4_8', ceilingpic: 'CEIL3_5', floorheight: 0, ceilingheight: 128 } as Sector;
    const outdoor = { floorpic: 'FLOOR4_8', ceilingpic: 'F_SKY1', floorheight: 0, ceilingheight: 128 } as Sector;
    const farIndoor = { floorpic: 'FLOOR4_8', ceilingpic: 'CEIL3_5', floorheight: 0, ceilingheight: 128 } as Sector;

    const map = {
      SECTORS: [indoor, outdoor, farIndoor],
      LINEDEFS: [
        { sidenum: [0, 1], v1: 0, v2: 1, flags: { blockAll: false } },
        { sidenum: [2, 3], v1: 2, v2: 3, flags: { blockAll: false } },
      ],
      SIDEDEFS: [{ sector: 0 }, { sector: 1 }, { sector: 2 }, { sector: 1 }],
      VERTEXES: [
        { x: 0, y: 0 },
        { x: 64, y: 0 },
        { x: 128, y: 0 },
        { x: 192, y: 0 },
      ],
    } as unknown as WadMap;

    expect(isSkySector(map, 0)).toBe(false);
    expect(isSkySector(map, 1)).toBe(true);

    const index = {
      subsectorToSector: [],
      sectorBounds: [
        { minX: 0, maxX: 64, minY: 0, maxY: 64 },
        { minX: 64, maxX: 128, minY: 0, maxY: 64 },
        { minX: 128, maxX: 192, minY: 0, maxY: 64 },
      ],
      sectorAdjacency: buildSectorAdjacency(map),
    };

    const visible = buildPortalVisibleSectors(index, map, 32, 32, 0, 512);
    expect(visible.has(0)).toBe(true);
    expect(visible.has(1)).toBe(true);
    expect(visible.has(2)).toBe(false);
  });

  it('treats boundary walls as visible when either adjacent sector is visible', () => {
    const map = {
      SECTORS: [{}, {}],
      LINEDEFS: [{ sidenum: [0, 1], v1: 0, v2: 1 }],
      SIDEDEFS: [{ sector: 0 }, { sector: 1 }],
      VERTEXES: [
        { x: 0, y: 0 },
        { x: 64, y: 0 },
      ],
    } as unknown as WadMap;

    const visible = new Set([1]);
    expect(getLineSectorIndices(map, 0)).toEqual([0, 1]);
    expect(isSectorPotentiallyVisible(0, visible, [1])).toBe(true);
    expect(
      isDrawVisible([32, 32, -32], [128, 32, -32], 2200, visible, 0, -1, false, [1])
    ).toBe(true);
  });

  it('returns true for all sectors when no visibility set is provided', () => {
    expect(isSectorPotentiallyVisible(0, null)).toBe(true);
    expect(isDrawVisible([64, 0, -64], [0, 41, 0], 2200, null, 0, -1, true)).toBe(true);
  });

  it('ignores vertical distance when horizontalOnly is enabled', () => {
    const visible = new Set([1]);
    expect(
      isDrawVisible([64, 9999, -64], [0, 41, 0], 2200, visible, 1, 0, true)
    ).toBe(true);
    expect(
      isDrawVisible([64, 9999, -64], [0, 41, 0], 2200, visible, 1, 0, false)
    ).toBe(false);
  });

  it('excludes block-all lines from sector adjacency', () => {
    const map = {
      SECTORS: [{}, {}],
      LINEDEFS: [{ sidenum: [0, 1], v1: 0, v2: 1, flags: { blockAll: true } }],
      SIDEDEFS: [{ sector: 0 }, { sector: 1 }],
      VERTEXES: [
        { x: 0, y: 0 },
        { x: 64, y: 0 },
      ],
    } as unknown as WadMap;

    expect(buildSectorAdjacency(map)).toEqual([[], []]);
  });

  it('limits portal traversal depth', () => {
    const index = {
      subsectorToSector: [],
      sectorBounds: [
        { minX: 0, maxX: 64, minY: 0, maxY: 64 },
        { minX: 64, maxX: 128, minY: 0, maxY: 64 },
        { minX: 128, maxX: 192, minY: 0, maxY: 64 },
      ],
      sectorAdjacency: [[1], [0, 2], [1]],
    };

    const visible = buildPortalVisibleSectors(
      index,
      { SECTORS: [{}, {}, {}] } as WadMap,
      32,
      32,
      0,
      512,
      1
    );

    expect(visible.has(0)).toBe(true);
    expect(visible.has(1)).toBe(true);
    expect(visible.has(2)).toBe(false);
  });

  it('builds a visibility index from real E1M1 BSP data', () => {
    const map = loadE1M1();
    const index = buildSectorVisibilityIndex(map);

    expect(index).not.toBeNull();
    expect(index!.subsectorToSector.length).toBe(map.SSECTORS.length);
    expect(index!.sectorBounds.filter(Boolean).length).toBeGreaterThan(0);
    expect(index!.sectorAdjacency.length).toBe(map.SECTORS.length);
  });

  it('finds the camera sector index in E1M1 using triangle lookup', () => {
    const map = loadE1M1();
    const index = buildSectorVisibilityIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1);
    expect(playerStart).toBeTruthy();

    const sectorIndex = findCameraSectorIndex(map, {}, null, [playerStart!.x, 41, -playerStart!.y]);
    expect(sectorIndex).toBeGreaterThanOrEqual(0);
    expect(index.sectorBounds[sectorIndex]).not.toBeNull();
  });

  it('finalizes sector bounds from triangle data', () => {
    const index = emptyIndex(1, [null]);
    finalizeSectorVisibilityIndex(index, {
      0: [[{ x: 128, y: 128 }, { x: 256, y: 128 }, { x: 128, y: 256 }]],
    });

    expect(index!.sectorBounds[0]).toEqual({
      minX: 128,
      maxX: 256,
      minY: 128,
      maxY: 256,
    });
  });

  it('returns an empty set when the camera sector index is invalid', () => {
    const visible = buildPortalVisibleSectors(
      emptyIndex(2),
      { SECTORS: [{}, {}] } as WadMap,
      32,
      32,
      -1,
      512
    );
    expect(visible.size).toBe(0);
  });

  it('walks the BSP to find the camera subsector', () => {
    const map = {
      NODES: [{ x: 0, y: 0, dx: 1, dy: 1, children: [0x8000, 0x8001] }],
      SSECTORS: [{}, {}],
    } as unknown as WadMap;

    expect(findCameraSubsector(map, 64, 0)).toBe(1);
    expect(findCameraSubsector(map, 0, 64)).toBe(0);
    expect(findCameraSubsector({ NODES: [] } as unknown as WadMap, 0, 0)).toBe(-1);
    expect(isSkySector({ SECTORS: [] } as unknown as WadMap, 3)).toBe(false);
  });

  it('builds potentially visible sectors through the portal flood helper', () => {
    const index = emptyIndex(2, [
      { minX: 0, maxX: 64, minY: 0, maxY: 64 },
      { minX: 64, maxX: 128, minY: 0, maxY: 64 },
    ]);
    index.sectorAdjacency = [[1], [0]];

    const visible = buildPotentiallyVisibleSectors(
      index,
      { SECTORS: [{}, {}] } as WadMap,
      32,
      32,
      0,
      512
    );

    expect(visible.has(0)).toBe(true);
    expect(visible.has(1)).toBe(true);
  });
});

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}
