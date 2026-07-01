import {
  GZTICK_PATCH,
  type GztickPatch,
  type GztickPatchSectorHeight,
} from '@hypercrab2000/doom-gzengine-core';
import type { WadMap } from '@/wad/interfaces/WadMap';

/** Build renderer patch stream from TS mapAction dirty sectors (until WASM engine ships). */
export function patchesFromDirtySectors(
  map: WadMap,
  dirtySectors: ReadonlySet<number>,
): GztickPatch[] {
  const patches: GztickPatchSectorHeight[] = [];
  for (const sectorIndex of dirtySectors) {
    const sector = map.SECTORS[sectorIndex];
    if (!sector) continue;
    patches.push({
      type: GZTICK_PATCH.SECTOR_HEIGHT,
      sectorIndex,
      floorHeight: sector.floorheight,
      ceilingHeight: sector.ceilingheight,
    });
  }
  return patches;
}
