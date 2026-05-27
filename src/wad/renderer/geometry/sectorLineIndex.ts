import type { WadMap } from '@/wad/interfaces/WadMap';

/** Linedef indices that touch any of the given sector indices. */
export function getLineIndicesForSectors(map: WadMap, sectorIndices: Iterable<number>): Set<number> {
  const sectors = new Set(sectorIndices);
  const lines = new Set<number>();

  map.LINEDEFS.forEach((line, lineIndex) => {
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      if (sectors.has(map.SIDEDEFS[sideIndex].sector)) {
        lines.add(lineIndex);
        break;
      }
    }
  });

  return lines;
}

/** Linedef indices that reference any of the given sidedef indices. */
export function getLineIndicesForSides(map: WadMap, sideIndices: Iterable<number>): Set<number> {
  const sides = new Set(sideIndices);
  const lines = new Set<number>();

  map.LINEDEFS.forEach((line, lineIndex) => {
    for (const sideIndex of line.sidenum) {
      if (sideIndex >= 0 && sides.has(sideIndex)) {
        lines.add(lineIndex);
        break;
      }
    }
  });

  return lines;
}

export function getFlatIndicesForSectors(
  flats: Array<{ sectorIndex: number }>,
  sectorIndices: Iterable<number>
): number[] {
  const sectors = new Set(sectorIndices);
  const indices: number[] = [];
  flats.forEach((flat, index) => {
    if (sectors.has(flat.sectorIndex)) {
      indices.push(index);
    }
  });
  return indices;
}
