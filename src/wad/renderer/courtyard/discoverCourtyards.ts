import type { WadMap } from '@/wad/interfaces/WadMap';
import type { Wad } from '@/wad/interfaces/Wad';
import {
  buildSectorVisibilityIndex,
  buildSkyIslandIds,
  type SectorVisibilityIndex,
} from '@/wad/renderer/utils/sectorVisibility';
import { isSkySector } from '@/wad/renderer/utils/sectorSkyVisibility';

/** A sky island that behaves like a courtyard (multi-cell outdoor or window-lined). */
export interface CourtyardIsland {
  mapName: string;
  islandId: number;
  /** F_SKY sectors in this connected outdoor cell. */
  skySectors: number[];
  /** Indoor sectors sharing a two-sided edge with any sky sector in the island. */
  windowRooms: number[];
}

export interface CourtyardProbe {
  mapName: string;
  islandId: number;
  /** Sector the camera stands in for this probe. */
  cameraSector: number;
  x: number;
  y: number;
  label: string;
}

export interface CourtyardMapAnalysis {
  mapName: string;
  index: SectorVisibilityIndex;
  skyIslandIds: Int32Array;
  islands: CourtyardIsland[];
  probes: CourtyardProbe[];
}

function sectorBoundsCenter(
  index: SectorVisibilityIndex,
  sectorIndex: number
): { x: number; y: number } | null {
  const bounds = index.sectorBounds[sectorIndex];
  if (!bounds) return null;
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function windowRoomsForIsland(
  map: WadMap,
  index: SectorVisibilityIndex,
  skySectors: readonly number[]
): number[] {
  const windows = new Set<number>();
  for (const sky of skySectors) {
    for (const neighbor of index.sectorAdjacency[sky] ?? []) {
      if (!isSkySector(map, neighbor)) {
        windows.add(neighbor);
      }
    }
  }
  return [...windows].sort((a, b) => a - b);
}

/** Discover courtyard-like sky islands in one map. */
export function discoverCourtyardIslands(map: WadMap, mapName: string): CourtyardMapAnalysis | null {
  const index = buildSectorVisibilityIndex(map);
  if (!index) return null;

  const skyIslandIds = buildSkyIslandIds(map, index);
  const maxIslandId = skyIslandIds.reduce((max, id) => Math.max(max, id), -1);
  const islands: CourtyardIsland[] = [];

  for (let islandId = 0; islandId <= maxIslandId; islandId++) {
    const skySectors: number[] = [];
    for (let sectorIndex = 0; sectorIndex < map.SECTORS.length; sectorIndex++) {
      if (isSkySector(map, sectorIndex) && skyIslandIds[sectorIndex] === islandId) {
        skySectors.push(sectorIndex);
      }
    }
    if (skySectors.length === 0) continue;

    const windowRooms = windowRoomsForIsland(map, index, skySectors);
    if (skySectors.length < 2 && windowRooms.length < 2) continue;

    islands.push({
      mapName,
      islandId,
      skySectors,
      windowRooms,
    });
  }

  const probes: CourtyardProbe[] = [];
  for (const island of islands) {
    for (const skySector of island.skySectors) {
      const center = sectorBoundsCenter(index, skySector);
      if (!center) continue;
      probes.push({
        mapName,
        islandId: island.islandId,
        cameraSector: skySector,
        x: center.x,
        y: center.y,
        label: `${mapName} island ${island.islandId} sky ${skySector}`,
      });
    }
    for (const windowRoom of island.windowRooms) {
      const center = sectorBoundsCenter(index, windowRoom);
      if (!center) continue;
      probes.push({
        mapName,
        islandId: island.islandId,
        cameraSector: windowRoom,
        x: center.x,
        y: center.y,
        label: `${mapName} island ${island.islandId} window ${windowRoom}`,
      });
    }
  }

  return { mapName, index, skyIslandIds, islands, probes };
}

export function discoverCourtyardsInWad(wad: Wad): CourtyardMapAnalysis[] {
  const results: CourtyardMapAnalysis[] = [];
  for (const mapName of Object.keys(wad.maps).sort()) {
    const analysis = discoverCourtyardIslands(wad.maps[mapName], mapName);
    if (analysis && analysis.islands.length > 0) {
      results.push(analysis);
    }
  }
  return results;
}

export function allCourtyardProbes(analyses: readonly CourtyardMapAnalysis[]): CourtyardProbe[] {
  return analyses.flatMap((analysis) => analysis.probes);
}
