import { describe, expect, it, vi } from 'vitest';

import type { WadMap } from '@/wad/interfaces/WadMap';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import type { StructuralViewSnapshot } from '@/wad/parity/structural/structuralViewSnapshot';
import {
  checkStructuralViewSnapshot,
  formatStructuralViolations,
} from '@/wad/parity/structural/structuralVisibilityInvariants';

vi.mock('@/wad/renderer/bsp/bspRenderIndex', () => ({
  findCameraSubsector: (_map: WadMap, x: number, _y: number) => {
    if (x === 10) return 0;
    if (x === 20) return 1;
    return -1;
  },
}));

function emptyFlags(hideInSingleplayer = false) {
  return {
    difficulty: 0 as never,
    isDeaf: false,
    hideInSingleplayer,
  };
}

/** Two-sector stub: REJECT blocks 0→1 and 1→0. */
function makeMap(): WadMap {
  const reject = new Uint8Array(2);
  reject[0] = 0b00000010;
  reject[1] = 0b00000001;
  return {
    SECTORS: [{}, {}] as never,
    THINGS: [
      { x: 10, y: 0, angle: 0, type: 2001, flags: emptyFlags() },
      { x: 20, y: 0, angle: 0, type: 2014, flags: emptyFlags() },
      { x: 10, y: 1, angle: 0, type: 5, flags: emptyFlags(true) },
      { x: 99, y: 0, angle: 0, type: 3001, flags: emptyFlags() },
    ],
    REJECT: reject,
    NODES: [],
  } as unknown as WadMap;
}

function makeIndex(): BspRenderIndex {
  return { subsectorToSector: [0, 1] } as unknown as BspRenderIndex;
}

function baseSnapshot(overrides: Partial<StructuralViewSnapshot> = {}): StructuralViewSnapshot {
  return {
    cameraSectorIndex: 0,
    cameraSubsector: 0,
    bspVisibleSectors: [0],
    drawVisibleSectors: [0],
    bspWallLines: [1],
    visibleThingIndices: [0],
    visibleThingTypes: [2001],
    ...overrides,
  };
}

describe('checkStructuralViewSnapshot', () => {
  it('accepts a consistent draw ⊆ BSP snapshot with matching things', () => {
    const violations = checkStructuralViewSnapshot('ok', makeMap(), makeIndex(), baseSnapshot());
    expect(violations).toEqual([]);
  });

  it('flags camera missing from BSP and draw sets', () => {
    const violations = checkStructuralViewSnapshot(
      'cam',
      makeMap(),
      makeIndex(),
      baseSnapshot({
        cameraSectorIndex: 0,
        bspVisibleSectors: [1],
        drawVisibleSectors: [1],
        visibleThingIndices: [1],
        visibleThingTypes: [2014],
      })
    );
    expect(violations.map((v) => v.rule)).toEqual(
      expect.arrayContaining(['camera-in-bsp', 'camera-in-draw'])
    );
  });

  it('flags draw sectors outside BSP and REJECT-blocked from camera', () => {
    const violations = checkStructuralViewSnapshot(
      'reject',
      makeMap(),
      makeIndex(),
      baseSnapshot({
        bspVisibleSectors: [0, 1],
        drawVisibleSectors: [0, 1],
        visibleThingIndices: [0, 1],
        visibleThingTypes: [2001, 2014],
      })
    );
    const rules = violations.map((v) => v.rule);
    expect(rules).toContain('draw-subset-reject');
    expect(rules).toContain('draw-in-reject-set');
  });

  it('flags draw sector not in BSP', () => {
    const violations = checkStructuralViewSnapshot(
      'subset',
      makeMap(),
      makeIndex(),
      baseSnapshot({
        bspVisibleSectors: [0],
        drawVisibleSectors: [0, 1],
        visibleThingIndices: [0, 1],
        visibleThingTypes: [2001, 2014],
      })
    );
    expect(violations.some((v) => v.rule === 'draw-subset-bsp')).toBe(true);
  });

  it('flags mismatched thing parallel arrays', () => {
    const violations = checkStructuralViewSnapshot(
      'things',
      makeMap(),
      makeIndex(),
      baseSnapshot({
        visibleThingIndices: [0],
        visibleThingTypes: [2001, 9999],
      })
    );
    expect(violations.map((v) => v.rule)).toContain('thing-parallel-arrays');
  });

  it('flags wrong thing type for a listed index', () => {
    const violations = checkStructuralViewSnapshot(
      'type',
      makeMap(),
      makeIndex(),
      baseSnapshot({
        visibleThingIndices: [0],
        visibleThingTypes: [9999],
      })
    );
    expect(violations.map((v) => v.rule)).toContain('thing-type-match');
  });

  it('flags missing thing index and incomplete candidate list', () => {
    const violations = checkStructuralViewSnapshot(
      'missing',
      makeMap(),
      makeIndex(),
      baseSnapshot({
        visibleThingIndices: [99],
        visibleThingTypes: [1],
      })
    );
    const rules = violations.map((v) => v.rule);
    expect(rules).toContain('thing-index-valid');
    expect(rules).toContain('thing-set-complete');
  });

  it('formatStructuralViolations truncates and formats', () => {
    const text = formatStructuralViolations(
      [
        { rule: 'a', context: 'c', detail: 'd' },
        { rule: 'b', context: 'c', detail: 'e' },
      ],
      1
    );
    expect(text).toBe('[a] c: d');
  });
});
