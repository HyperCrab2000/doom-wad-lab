import type { WadMap } from '@/wad/interfaces/WadMap';

/** Matches Doom `P_Find*Surrounding` when no neighbor exists (~ -500 * FRACUNIT). */
const NO_NEIGHBOR_FLOOR = -32000;

function forEachNeighborSector(
  map: WadMap,
  sectorIndex: number,
  visit: (neighborIndex: number, floorheight: number) => void
): void {
  for (const line of map.LINEDEFS) {
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      if (map.SIDEDEFS[sideIndex].sector !== sectorIndex) continue;
      const otherSide = line.sidenum[0] === sideIndex ? line.sidenum[1] : line.sidenum[0];
      if (otherSide < 0) continue;
      const neighborIndex = map.SIDEDEFS[otherSide].sector;
      if (neighborIndex === sectorIndex) continue;
      const neighbor = map.SECTORS[neighborIndex];
      if (neighbor) visit(neighborIndex, neighbor.floorheight);
    }
  }
}

/** Doom `P_FindHighestFloorSurrounding` (p_spec.c). */
export function findHighestFloorSurrounding(map: WadMap, sectorIndex: number): number {
  let max = NO_NEIGHBOR_FLOOR;
  forEachNeighborSector(map, sectorIndex, (_neighborIndex, floorheight) => {
    max = Math.max(max, floorheight);
  });
  if (max === NO_NEIGHBOR_FLOOR) {
    return map.SECTORS[sectorIndex]?.floorheight ?? 0;
  }
  return max;
}

/** Doom `P_FindLowestFloorSurrounding` (p_spec.c). */
export function findLowestFloorSurrounding(map: WadMap, sectorIndex: number): number {
  let min = Number.POSITIVE_INFINITY;
  forEachNeighborSector(map, sectorIndex, (_neighborIndex, floorheight) => {
    min = Math.min(min, floorheight);
  });
  if (!Number.isFinite(min)) {
    return map.SECTORS[sectorIndex]?.floorheight ?? 0;
  }
  return min;
}
