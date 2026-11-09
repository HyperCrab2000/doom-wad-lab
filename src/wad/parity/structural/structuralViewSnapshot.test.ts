import { describe, expect, it, vi } from 'vitest';

import type { WadMap } from '@/wad/interfaces/WadMap';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import type { BspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import {
  buildStructuralViewSnapshot,
  collectVisibleThingIndices,
  hashStructuralViewSnapshot,
  sectorIndexAtPoint,
  structuralCoreEqual,
  type StructuralViewSnapshot,
} from '@/wad/parity/structural/structuralViewSnapshot';

vi.mock('@/wad/renderer/bsp/bspRenderIndex', () => ({
  findCameraSubsector: (_map: WadMap, x: number) => {
    if (x === 10) return 0;
    if (x === 20) return 1;
    return -1;
  },
}));

function snap(partial: Partial<StructuralViewSnapshot> = {}): StructuralViewSnapshot {
  return {
    cameraSectorIndex: 0,
    cameraSubsector: 0,
    bspVisibleSectors: [0, 1],
    drawVisibleSectors: [0],
    bspWallLines: [3, 7],
    visibleThingIndices: [0],
    visibleThingTypes: [2001],
    ...partial,
  };
}

describe('structuralViewSnapshot helpers', () => {
  const index = { subsectorToSector: [0, 1] } as unknown as BspRenderIndex;
  const map = {
    THINGS: [
      { x: 10, y: 0, angle: 0, type: 2001, flags: { hideInSingleplayer: false, isDeaf: false, difficulty: 0 } },
      { x: 20, y: 0, angle: 0, type: 2014, flags: { hideInSingleplayer: false, isDeaf: false, difficulty: 0 } },
      { x: 10, y: 1, angle: 0, type: 5, flags: { hideInSingleplayer: true, isDeaf: false, difficulty: 0 } },
    ],
    NODES: [],
  } as unknown as WadMap;

  it('sectorIndexAtPoint maps subsector → sector and returns -1 when unknown', () => {
    expect(sectorIndexAtPoint(map, index, 10, 0)).toBe(0);
    expect(sectorIndexAtPoint(map, index, 99, 0)).toBe(-1);
    expect(sectorIndexAtPoint(map, { subsectorToSector: [] } as never, 10, 0)).toBe(-1);
  });

  it('collectVisibleThingIndices skips hidden and out-of-set things', () => {
    const { indices, types } = collectVisibleThingIndices(map, index, new Set([0]));
    expect(indices).toEqual([0]);
    expect(types).toEqual([2001]);
  });

  it('buildStructuralViewSnapshot sorts sectors/walls and collects things', () => {
    const bspVisible = {
      cameraSectorIndex: 0,
      cameraSubsector: 0,
      visibleSectors: new Set([1, 0]),
      visibleLineIndices: new Set([7, 3]),
    } as unknown as BspVisibleSet;
    const drawState = { visibleSectors: [0] } as unknown as GzdoomDrawState;
    const result = buildStructuralViewSnapshot(map, index, bspVisible, drawState);
    expect(result.bspVisibleSectors).toEqual([0, 1]);
    expect(result.bspWallLines).toEqual([3, 7]);
    expect(result.visibleThingIndices).toEqual([0]);
  });

  it('structuralCoreEqual detects length and value mismatches', () => {
    const a = snap();
    expect(structuralCoreEqual(a, snap())).toBe(true);
    expect(structuralCoreEqual(a, snap({ cameraSectorIndex: 1 }))).toBe(false);
    expect(structuralCoreEqual(a, snap({ bspVisibleSectors: [0] }))).toBe(false);
    expect(structuralCoreEqual(a, snap({ bspVisibleSectors: [0, 2] }))).toBe(false);
  });

  it('hashStructuralViewSnapshot is stable for identical payloads', () => {
    const a = hashStructuralViewSnapshot(snap());
    const b = hashStructuralViewSnapshot(snap());
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
    expect(hashStructuralViewSnapshot(snap({ cameraSubsector: 9 }))).not.toBe(a);
  });
});
