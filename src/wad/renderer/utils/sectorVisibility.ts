import { Node } from '@/wad/interfaces/Node';
import { WadMap } from '@/wad/interfaces/WadMap';
import { Triangle } from '@/wad/interfaces/Triangle';
import {
  isSkySector,
  MAX_SKY_PORTAL_CHAIN,
} from '@/wad/renderer/utils/sectorSkyVisibility';

export { isSkySector } from '@/wad/renderer/utils/sectorSkyVisibility';
import {
  DEFAULT_VISIBILITY_DISTANCE,
  MAX_INDOOR_PORTAL_DEPTH,
  MAX_PORTAL_TRAVERSAL_DEPTH,
  PORTAL_VISIBILITY_RADIUS,
  VISIBILITY_DISTANCE_MARGIN,
} from '@/wad/constants/RenderInfo';
import { findSectorAtPoint, SectorTriangleHash } from '@/wad/renderer/utils/sectorLookup';
import {
  childIsSubsector,
  childSubsectorIndex,
  normalizeBspChild,
  pointOnSide,
} from '@/wad/renderer/bsp/bspRenderIndex';

export interface SectorVisibilityIndex {
  subsectorToSector: number[];
  sectorBounds: Array<{ minX: number; maxX: number; minY: number; maxY: number } | null>;
  sectorAdjacency: number[][];
}

function mergeBounds(
  existing: { minX: number; maxX: number; minY: number; maxY: number } | null,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  if (!existing) {
    return { minX, maxX, minY, maxY };
  }
  return {
    minX: Math.min(existing.minX, minX),
    maxX: Math.max(existing.maxX, maxX),
    minY: Math.min(existing.minY, minY),
    maxY: Math.max(existing.maxY, maxY),
  };
}

export function enrichSectorBoundsFromTriangles(
  index: SectorVisibilityIndex,
  sectorTriangles: Record<number, Triangle[]>
): void {
  for (const [key, triangles] of Object.entries(sectorTriangles)) {
    if (!triangles?.length) continue;

    const sectorIndex = Number(key);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const triangle of triangles) {
      for (const vertex of triangle) {
        minX = Math.min(minX, vertex.x);
        maxX = Math.max(maxX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxY = Math.max(maxY, vertex.y);
      }
    }

    index.sectorBounds[sectorIndex] = mergeBounds(
      index.sectorBounds[sectorIndex],
      minX,
      maxX,
      minY,
      maxY
    );
  }
}

export function finalizeSectorVisibilityIndex(
  index: SectorVisibilityIndex | null,
  sectorTriangles: Record<number, Triangle[]>
): SectorVisibilityIndex | null {
  if (!index) return null;
  enrichSectorBoundsFromTriangles(index, sectorTriangles);
  return index;
}

export function buildSectorVisibilityIndex(map: WadMap): SectorVisibilityIndex | null {
  const nodes = map.NODES as Node[] | undefined;
  const ssectors = map.SSECTORS;
  const segs = map.SEGS;
  if (!nodes?.length || !ssectors?.length || !segs?.length) {
    return null;
  }

  const subsectorToSector = new Array<number>(ssectors.length);
  for (let i = 0; i < ssectors.length; i++) {
    const seg = segs[ssectors[i].firstseg];
  if (!seg) {
      subsectorToSector[i] = -1;
      continue;
    }
    const line = map.LINEDEFS[seg.linedef];
    const sideIndex = line?.sidenum[seg.side & 1];
    subsectorToSector[i] = sideIndex != null && sideIndex >= 0 ? map.SIDEDEFS[sideIndex].sector : -1;
  }

  const sectorBounds = map.SECTORS.map((): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null => null);

  for (const line of map.LINEDEFS) {
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      const sectorIndex = map.SIDEDEFS[sideIndex].sector;
      const v1 = map.VERTEXES[line.v1];
      const v2 = map.VERTEXES[line.v2];
      const bounds = sectorBounds[sectorIndex] ?? {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      };
      bounds.minX = Math.min(bounds.minX, v1.x, v2.x);
      bounds.maxX = Math.max(bounds.maxX, v1.x, v2.x);
      bounds.minY = Math.min(bounds.minY, v1.y, v2.y);
      bounds.maxY = Math.max(bounds.maxY, v1.y, v2.y);
      sectorBounds[sectorIndex] = bounds;
    }
  }

  return { subsectorToSector, sectorBounds, sectorAdjacency: buildSectorAdjacency(map) };
}

export function buildSectorAdjacency(map: WadMap): number[][] {
  const adjacency = map.SECTORS.map(() => new Set<number>());

  for (const line of map.LINEDEFS) {
    if (line.sidenum[0] < 0 || line.sidenum[1] < 0) continue;
    if (line.flags.blockAll) continue;
    const sectorA = map.SIDEDEFS[line.sidenum[0]].sector;
    const sectorB = map.SIDEDEFS[line.sidenum[1]].sector;
    if (sectorA === sectorB) continue;
    adjacency[sectorA].add(sectorB);
    adjacency[sectorB].add(sectorA);
  }

  return adjacency.map((neighbors) => [...neighbors]);
}

export function findCameraSubsector(map: WadMap, x: number, y: number): number {
  const nodes = map.NODES as Node[] | undefined;
  if (!nodes?.length) return -1;
  return walkSubsector(nodes, x, y, normalizeBspChild(nodes.length - 1));
}

function walkSubsector(nodes: Node[], x: number, y: number, nodeIndex: number): number {
  if (childIsSubsector(nodeIndex)) {
    return childSubsectorIndex(nodeIndex);
  }
  const normalizedIndex = normalizeBspChild(nodeIndex);
  if (normalizedIndex < 0 || normalizedIndex >= nodes.length) {
    return -1;
  }

  const node = nodes[normalizedIndex];
  const side = pointOnSide(x, y, node);
  return walkSubsector(nodes, x, y, normalizeBspChild(node.children[side]));
}

/** Resolve camera sector via BSP subsector walk (fast, matches vanilla). */
export function findCameraSectorIndexFromBsp(
  map: WadMap,
  visibilityIndex: SectorVisibilityIndex | null | undefined,
  cameraPos: [number, number, number]
): number {
  if (!visibilityIndex?.subsectorToSector?.length) return -1;
  const subsector = findCameraSubsector(map, cameraPos[0], -cameraPos[2]);
  if (subsector < 0) return -1;
  const sectorIndex = visibilityIndex.subsectorToSector[subsector];
  return sectorIndex >= 0 ? sectorIndex : -1;
}

export function findCameraSectorIndex(
  map: WadMap,
  sectorTriangles: Record<number, Triangle[]>,
  triangleHash: SectorTriangleHash | null,
  cameraPos: [number, number, number],
  visibilityIndex?: SectorVisibilityIndex | null
): number {
  const hasTriangleGeometry =
    triangleHash != null || Object.keys(sectorTriangles).length > 0;
  if (hasTriangleGeometry) {
    const sector = findSectorAtPoint(map, sectorTriangles, triangleHash, {
      x: cameraPos[0],
      y: -cameraPos[2],
    });
    if (sector) {
      const sectorIndex = map.SECTORS.indexOf(sector);
      if (sectorIndex >= 0) {
        return sectorIndex;
      }
    }
  }

  return findCameraSectorIndexFromBsp(map, visibilityIndex, cameraPos);
}

export function buildPotentiallyVisibleSectors(
  index: SectorVisibilityIndex,
  map: WadMap,
  cameraX: number,
  cameraY: number,
  cameraSectorIndex: number,
  maxRadius = PORTAL_VISIBILITY_RADIUS
): Set<number> {
  return buildPortalVisibleSectors(
    index,
    map,
    cameraX,
    cameraY,
    cameraSectorIndex,
    maxRadius,
    MAX_PORTAL_TRAVERSAL_DEPTH
  );
}

/**
 * Flood-fill sectors reachable from the camera through two-sided portals.
 * Sky sectors are grouped into islands (separate courtyards / outdoor areas).
 * You only see another outdoor area if you reach it through a connected portal —
 * never by walking the indoor graph into a different sky island.
 */
export function buildPortalVisibleSectors(
  index: SectorVisibilityIndex,
  map: WadMap,
  cameraX: number,
  cameraY: number,
  cameraSectorIndex: number,
  _maxRadius = PORTAL_VISIBILITY_RADIUS,
  maxDepth = MAX_PORTAL_TRAVERSAL_DEPTH
): Set<number> {
  const visible = new Set<number>();
  if (cameraSectorIndex < 0 || map.SECTORS.length === 0) {
    return visible;
  }

  const skyIslandIds = buildSkyIslandIds(map, index);
  const cameraInSky = isSkySector(map, cameraSectorIndex);
  const cameraSkyContext = cameraInSky ? skyIslandIds[cameraSectorIndex] : null;

  const queue: Array<{
    sectorIndex: number;
    depth: number;
    skyChain: number;
    skyContext: number | null;
    indoorDepth: number;
  }> = [{
    sectorIndex: cameraSectorIndex,
    depth: 0,
    skyChain: cameraInSky ? 0 : -1,
    skyContext: cameraSkyContext,
    indoorDepth: 0,
  }];

  let queueHead = 0;

  while (queueHead < queue.length) {
    const { sectorIndex, depth, skyChain, skyContext, indoorDepth } = queue[queueHead++]!;
    if (visible.has(sectorIndex)) continue;

    visible.add(sectorIndex);
    if (depth >= maxDepth) continue;

    for (const neighbor of index.sectorAdjacency[sectorIndex] ?? []) {
      if (visible.has(neighbor)) continue;

      const fromIsSky = isSkySector(map, sectorIndex);
      const toIsSky = isSkySector(map, neighbor);
      const nextIndoorDepth =
        !fromIsSky && !toIsSky
          ? indoorDepth + 1
          : fromIsSky && !toIsSky
            ? 0
            : indoorDepth;

      const nextSkyChain = advanceSkyChain(map, sectorIndex, neighbor, skyChain);
      if (
        !canTraversePortal(
          index,
          map,
          skyIslandIds,
          cameraSectorIndex,
          cameraInSky,
          sectorIndex,
          neighbor,
          nextSkyChain,
          skyContext,
          indoorDepth
        )
      ) {
        continue;
      }

      let nextContext = skyContext;
      if (toIsSky && !fromIsSky) {
        nextContext = skyIslandIds[neighbor];
      } else if (fromIsSky && !toIsSky) {
        nextContext = skyIslandIds[sectorIndex];
      }

      queue.push({
        sectorIndex: neighbor,
        depth: depth + 1,
        skyChain: nextSkyChain,
        skyContext: nextContext,
        indoorDepth: nextIndoorDepth,
      });
    }
  }

  return visible;
}

/** Connected components of sky sectors (each courtyard / outdoor cell is its own island). */
function buildSkyIslandIds(map: WadMap, index: SectorVisibilityIndex): Int32Array {
  const ids = new Int32Array(map.SECTORS.length);
  ids.fill(-1);
  let nextId = 0;

  for (let sectorIndex = 0; sectorIndex < map.SECTORS.length; sectorIndex++) {
    if (!isSkySector(map, sectorIndex) || ids[sectorIndex] >= 0) continue;

    const stack = [sectorIndex];
    ids[sectorIndex] = nextId;

    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const neighbor of index.sectorAdjacency[current] ?? []) {
        if (!isSkySector(map, neighbor) || ids[neighbor] >= 0) continue;
        ids[neighbor] = nextId;
        stack.push(neighbor);
      }
    }

    nextId++;
  }

  return ids;
}

/** Tracks consecutive sky-sector hops for outdoor portal chains. */
function advanceSkyChain(
  map: WadMap,
  fromSectorIndex: number,
  toSectorIndex: number,
  skyChain: number
): number {
  if (!isSkySector(map, toSectorIndex)) return skyChain;
  if (fromSectorIndex === toSectorIndex) return skyChain;
  if (!isSkySector(map, fromSectorIndex)) return 0;
  return skyChain < 0 ? 0 : skyChain + 1;
}

/** True when a two-sided linedef connects both sectors (door, window, portal). */
export function sectorsSharePortalLine(map: WadMap, sectorA: number, sectorB: number): boolean {
  if (sectorA === sectorB) return true;
  for (const line of map.LINEDEFS) {
    if (line.sidenum[0] < 0 || line.sidenum[1] < 0) continue;
    const a = map.SIDEDEFS[line.sidenum[0]].sector;
    const b = map.SIDEDEFS[line.sidenum[1]].sector;
    if ((a === sectorA && b === sectorB) || (a === sectorB && b === sectorA)) {
      return true;
    }
  }
  return false;
}

function canTraversePortal(
  index: SectorVisibilityIndex,
  map: WadMap,
  skyIslandIds: Int32Array,
  cameraSectorIndex: number,
  cameraInSky: boolean,
  fromSectorIndex: number,
  toSectorIndex: number,
  skyChain: number,
  skyContext: number | null,
  indoorDepth: number
): boolean {
  if (toSectorIndex === cameraSectorIndex || fromSectorIndex === cameraSectorIndex) {
    return true;
  }

  const toIsSky = isSkySector(map, toSectorIndex);
  const fromIsSky = isSkySector(map, fromSectorIndex);
  const adjacent = index.sectorAdjacency[fromSectorIndex] ?? [];

  // Doorways between indoor rooms — only when the camera is indoors, within local reach.
  if (!fromIsSky && !toIsSky) {
    return !cameraInSky && indoorDepth < MAX_INDOOR_PORTAL_DEPTH;
  }

  // Step out of an indoor sector into outdoor sky.
  if (toIsSky && !fromIsSky) {
    if (cameraInSky) {
      return true;
    }
    const targetIsland = skyIslandIds[toSectorIndex];
    if (targetIsland < 0) {
      return false;
    }
    if (skyContext !== null) {
      return targetIsland === skyContext;
    }
    return (
      fromSectorIndex === cameraSectorIndex ||
      sectorsSharePortalLine(map, cameraSectorIndex, fromSectorIndex)
    );
  }

  // Move between sky sectors in the same outdoor island (courtyard/hangar cell).
  if (fromIsSky && toIsSky) {
    if (skyIslandIds[fromSectorIndex] !== skyIslandIds[toSectorIndex]) {
      return false;
    }
    return skyChain >= 0 && skyChain < MAX_SKY_PORTAL_CHAIN;
  }

  // Sky → attached indoor (window/door on the outdoor sector the camera uses).
  if (fromIsSky && !toIsSky) {
    if (!adjacent.includes(toSectorIndex)) {
      return false;
    }
    if (cameraInSky) {
      return fromSectorIndex === cameraSectorIndex;
    }
    return (
      toSectorIndex === cameraSectorIndex ||
      sectorsSharePortalLine(map, cameraSectorIndex, toSectorIndex)
    );
  }

  return false;
}

export function getLineSectorIndices(map: WadMap, lineIndex: number): number[] {
  if (lineIndex < 0) return [];
  const line = map.LINEDEFS[lineIndex];
  if (!line) return [];

  const sectors: number[] = [];
  for (const sideIndex of line.sidenum) {
    if (sideIndex < 0) continue;
    sectors.push(map.SIDEDEFS[sideIndex].sector);
  }
  return sectors;
}

export function isSectorPotentiallyVisible(
  sectorIndex: number,
  visibleSectors: Set<number> | null,
  relatedSectorIndices: readonly number[] = []
): boolean {
  if (!visibleSectors) return true;
  if (visibleSectors.has(sectorIndex)) return true;
  return relatedSectorIndices.some((index) => visibleSectors.has(index));
}

/** Portal-graph visibility only — no distance culling (Doom uses connectivity, not radius). */
export function isSectorGraphVisible(
  sectorIndex: number,
  visibleSectors: Set<number> | null,
  cameraSectorIndex: number,
  relatedSectorIndices: readonly number[] = []
): boolean {
  if (!visibleSectors) return true;
  if (cameraSectorIndex >= 0 && sectorIndex === cameraSectorIndex) return true;
  return isSectorPotentiallyVisible(sectorIndex, visibleSectors, relatedSectorIndices);
}

export function isDrawVisible(
  center: [number, number, number],
  cameraPos: [number, number, number],
  visibilityDistance: number,
  visibleSectors: Set<number> | null,
  sectorIndex: number,
  cameraSectorIndex = -1,
  horizontalOnly = false,
  relatedSectorIndices: readonly number[] = [],
  options?: { skipDistanceCull?: boolean }
): boolean {
  if (
    !isSectorGraphVisible(
      sectorIndex,
      visibleSectors,
      cameraSectorIndex,
      relatedSectorIndices
    )
  ) {
    return false;
  }

  if (options?.skipDistanceCull) {
    return true;
  }

  if (cameraSectorIndex >= 0 && sectorIndex === cameraSectorIndex) {
    return true;
  }

  const dx = center[0] - cameraPos[0];
  const dy = horizontalOnly ? 0 : center[1] - cameraPos[1];
  const dz = center[2] - cameraPos[2];
  const maxDist =
    (visibilityDistance > 0 ? visibilityDistance : DEFAULT_VISIBILITY_DISTANCE) +
    VISIBILITY_DISTANCE_MARGIN;
  return dx * dx + dy * dy + dz * dz <= maxDist * maxDist;
}
