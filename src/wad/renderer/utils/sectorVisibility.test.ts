import { describe, expect, it } from 'vitest';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import {
  buildPotentiallyVisibleSectors,
  enrichSectorBoundsFromTriangles,
  isDrawVisible,
} from './sectorVisibility';

describe('sector visibility culling', () => {
  it('keeps the camera sector floor visible even when its center is far away', () => {
    const visible = buildPotentiallyVisibleSectors(
      {
        subsectorToSector: [],
        sectorBounds: [{ minX: 0, maxX: 4096, minY: 0, maxY: 4096 }],
      },
      { SECTORS: [{} as Sector] } as WadMap,
      512,
      512,
      0,
      1400
    );

    const cameraPos: [number, number, number] = [512, 41, -512];
    const farFlatCenter: [number, number, number] = [3584, 0, -3584];

    expect(
      isDrawVisible(farFlatCenter, cameraPos, 900, visible, 0, 0, true)
    ).toBe(true);
  });

  it('includes sectors with missing line bounds once triangle bounds are enriched', () => {
    const index = {
      subsectorToSector: [],
      sectorBounds: [null, { minX: 1000, maxX: 2000, minY: 1000, maxY: 2000 }],
    };

    enrichSectorBoundsFromTriangles(index, {
      0: [
        [{ x: 128, y: 128 }, { x: 256, y: 128 }, { x: 128, y: 256 }],
      ],
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
  });

  it('includes vertically stacked sectors that share the same XY footprint', () => {
    const footprint = { minX: 100, maxX: 200, minY: 100, maxY: 200 };
    const visible = buildPotentiallyVisibleSectors(
      {
        subsectorToSector: [],
        sectorBounds: [footprint, footprint],
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

  it('does not distance-cull sectors already accepted by the visibility set', () => {
    const visible = new Set([2]);
    const farCenter: [number, number, number] = [5000, 0, -5000];

    expect(
      isDrawVisible(farCenter, [0, 41, 0], 900, visible, 2, -1, true)
    ).toBe(true);
  });

  it('still distance-culls when no visibility set is available', () => {
    const farCenter: [number, number, number] = [5000, 0, -5000];

    expect(
      isDrawVisible(farCenter, [0, 41, 0], 900, null, 0, -1, true)
    ).toBe(false);
  });
});
