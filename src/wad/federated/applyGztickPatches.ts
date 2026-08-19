import { GZTICK_PATCH, type GztickPatch } from '@hypercrab2000/doom-gzengine-core';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { LoadedWadData } from '@/wad/renderer/renderGame/loadWad';

export interface ApplyGztickPatchesResult {
  sectorIndices: Set<number>;
  thingIndices: Set<number>;
}

/** Apply engine patch stream onto the live map + renderable thing views. */
export function applyGztickPatches(
  map: WadMap,
  loaded: Pick<LoadedWadData, 'renderableThings' | 'sectorsByThing'>,
  patches: readonly GztickPatch[],
): ApplyGztickPatchesResult {
  const sectorIndices = new Set<number>();
  const thingIndices = new Set<number>();

  for (const patch of patches) {
    if (patch.type === GZTICK_PATCH.SECTOR_HEIGHT) {
      const sector = map.SECTORS[patch.sectorIndex];
      if (!sector) continue;
      sector.floorheight = patch.floorHeight;
      sector.ceilingheight = patch.ceilingHeight;
      sectorIndices.add(patch.sectorIndex);
      continue;
    }

    if (patch.type === GZTICK_PATCH.THING_MOVE) {
      const thingIndex = resolveThingIndex(map, patch.thingId);
      if (thingIndex == null) continue;
      const thing = map.THINGS[thingIndex];
      if (!thing) continue;
      thing.x = patch.x;
      thing.y = patch.y;
      thing.angle = patch.angle;
      thingIndices.add(thingIndex);

      for (const entry of loaded.renderableThings) {
        if (entry.thingIndex !== thingIndex) continue;
        entry.thingObj.x = patch.x;
        entry.thingObj.y = patch.y;
        entry.thingObj.angle = patch.angle;
      }
    }
  }

  return { sectorIndices, thingIndices };
}

function resolveThingIndex(map: WadMap, thingId: number): number | null {
  if (thingId >= 0 && thingId < map.THINGS.length) {
    return thingId;
  }
  const found = map.THINGS.findIndex((thing) => thing.type === thingId);
  return found >= 0 ? found : null;
}
