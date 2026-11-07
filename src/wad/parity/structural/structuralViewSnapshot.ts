import { createHash } from 'node:crypto';

import type { WadMap } from '@/wad/interfaces/WadMap';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { findCameraSubsector } from '@/wad/renderer/bsp/bspRenderIndex';
import type { BspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';

/**
 * Declarative view snapshot — no pixels.
 * Sorted integer lists so equality / hashing is deterministic.
 */
export interface StructuralViewSnapshot {
  cameraSectorIndex: number;
  cameraSubsector: number;
  /** BSP `RenderBSP` visible sectors (sorted). */
  bspVisibleSectors: number[];
  /** Mesh draw sectors after portal ∩ REJECT ∩ BSP (sorted). */
  drawVisibleSectors: number[];
  /** Linedefs submitted to wall draw from BSP (sorted unique). */
  bspWallLines: number[];
  /** Thing indices whose owning sector ∈ drawVisibleSectors (sorted). */
  visibleThingIndices: number[];
  /** Doom thing types for those indices (parallel to visibleThingIndices). */
  visibleThingTypes: number[];
}

export interface StructuralProbeKey {
  viewX: number;
  viewY: number;
  /** Radians; classic BSP ignores pitch — kept for pitch-invariance proofs. */
  viewYaw: number;
  viewPitch: number;
}

/** Map a map XY to the sector that owns its BSP subsector. */
export function sectorIndexAtPoint(map: WadMap, index: BspRenderIndex, x: number, y: number): number {
  const subsector = findCameraSubsector(map, x, y);
  if (subsector < 0) return -1;
  return index.subsectorToSector[subsector] ?? -1;
}

/**
 * Things that sit in a draw-visible sector are structural sprite/item candidates.
 * Multiplayer-hidden things stay out of the single-player candidate set.
 */
export function collectVisibleThingIndices(
  map: WadMap,
  index: BspRenderIndex,
  drawVisibleSectors: ReadonlySet<number>
): { indices: number[]; types: number[] } {
  const indices: number[] = [];
  const types: number[] = [];

  for (let thingIndex = 0; thingIndex < map.THINGS.length; thingIndex++) {
    const thing = map.THINGS[thingIndex]!;
    if (thing.flags.hideInSingleplayer) continue;
    const sectorIndex = sectorIndexAtPoint(map, index, thing.x, thing.y);
    if (sectorIndex < 0 || !drawVisibleSectors.has(sectorIndex)) continue;
    indices.push(thingIndex);
    types.push(thing.type);
  }

  return { indices, types };
}

export function buildStructuralViewSnapshot(
  map: WadMap,
  index: BspRenderIndex,
  bspVisible: BspVisibleSet,
  drawState: GzdoomDrawState
): StructuralViewSnapshot {
  const drawVisibleSectors = new Set(drawState.visibleSectors);
  const things = collectVisibleThingIndices(map, index, drawVisibleSectors);
  const wallLines = [...bspVisible.visibleLineIndices].sort((a, b) => a - b);

  return {
    cameraSectorIndex: bspVisible.cameraSectorIndex,
    cameraSubsector: bspVisible.cameraSubsector,
    bspVisibleSectors: [...bspVisible.visibleSectors].sort((a, b) => a - b),
    drawVisibleSectors: [...drawVisibleSectors].sort((a, b) => a - b),
    bspWallLines: wallLines,
    visibleThingIndices: things.indices,
    visibleThingTypes: things.types,
  };
}

/** Compare the pitch-invariant structural fields (everything except probe pitch). */
export function structuralCoreEqual(a: StructuralViewSnapshot, b: StructuralViewSnapshot): boolean {
  return (
    a.cameraSectorIndex === b.cameraSectorIndex &&
    a.cameraSubsector === b.cameraSubsector &&
    arraysEqual(a.bspVisibleSectors, b.bspVisibleSectors) &&
    arraysEqual(a.drawVisibleSectors, b.drawVisibleSectors) &&
    arraysEqual(a.bspWallLines, b.bspWallLines) &&
    arraysEqual(a.visibleThingIndices, b.visibleThingIndices) &&
    arraysEqual(a.visibleThingTypes, b.visibleThingTypes)
  );
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Stable SHA256 prefix for golden fixtures (Node/tests only). */
export function hashStructuralViewSnapshot(snapshot: StructuralViewSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0, 16);
}
