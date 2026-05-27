import type { WadMap } from '@/wad/interfaces/WadMap';

/** Two-sided linedef neighbors (sector indices). */
export function getAdjacentSectorIndices(map: WadMap, sectorIndex: number): number[] {
  const neighbors = new Set<number>();
  for (const line of map.LINEDEFS) {
    if (!line.flags.twoSided) continue;
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      if (map.SIDEDEFS[sideIndex].sector !== sectorIndex) continue;
      const otherSide = line.sidenum[0] === sideIndex ? line.sidenum[1] : line.sidenum[0];
      if (otherSide < 0) continue;
      neighbors.add(map.SIDEDEFS[otherSide].sector);
    }
  }
  neighbors.delete(sectorIndex);
  return [...neighbors];
}

/** BFS order from a start sector (used for stair building). */
export function bfsSectorChain(map: WadMap, startIndex: number, maxSteps = 40): number[] {
  const visited = new Set<number>();
  const order: number[] = [];
  const queue = [startIndex];
  visited.add(startIndex);

  while (queue.length > 0 && order.length < maxSteps) {
    const idx = queue.shift()!;
    order.push(idx);
    for (const neighbor of getAdjacentSectorIndices(map, idx)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return order;
}

export function getSectorsByTag(map: WadMap, tag: number): Array<{ sectorIndex: number }> {
  if (tag === 0) return [];
  return map.SECTORS.map((sector, sectorIndex) => ({ sector, sectorIndex }))
    .filter(({ sector }) => sector.tag === tag)
    .map(({ sectorIndex }) => ({ sectorIndex }));
}
