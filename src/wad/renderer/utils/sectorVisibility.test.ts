import { describe, expect, it } from 'vitest';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import {
  buildPortalVisibleSectors,
  buildPotentiallyVisibleSectors,
  buildSectorAdjacency,
  enrichSectorBoundsFromTriangles,
  isDrawVisible,
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
});
