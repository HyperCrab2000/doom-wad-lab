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
  INDOOR_CAMERA_MAX_SKY_INDOOR_DEPTH,
  MAX_PORTAL_TRAVERSAL_DEPTH,
  PORTAL_VISIBILITY_RADIUS,
  VISIBILITY_DISTANCE_MARGIN,
} from '@/wad/constants/RenderInfo';
import { findSectorAtPoint, SectorTriangleHash } from '@/wad/renderer/utils/sectorLookup';

const SUBSECTOR_FLAG = 0x8000;
/** Doom stores subsector ids in the high bit; mask must be 0x7fff (`~0x8000` is wrong in JS). */
const SUBSECTOR_INDEX_MASK = SUBSECTOR_FLAG - 1;

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
  return walkSubsector(nodes, x, y, nodes.length - 1);
}

function walkSubsector(nodes: Node[], x: number, y: number, nodeIndex: number): number {
  if ((nodeIndex & SUBSECTOR_FLAG) !== 0) {
    return nodeIndex & SUBSECTOR_INDEX_MASK;
  }
  if (nodeIndex < 0 || nodeIndex >= nodes.length) {
    return -1;
  }

  const node = nodes[nodeIndex];
  const dx = x - node.x;
  const dy = y - node.y;
  const side = dx * node.dy - dy * node.dx;

  if (side <= 0) {
    return walkSubsector(nodes, x, y, node.children[0]);
  }
  return walkSubsector(nodes, x, y, node.children[1]);
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
  const fromBsp = findCameraSectorIndexFromBsp(map, visibilityIndex, cameraPos);
  if (fromBsp >= 0) return fromBsp;

  const sector = findSectorAtPoint(map, sectorTriangles, triangleHash, {
    x: cameraPos[0],
    y: -cameraPos[2],
  });
  if (!sector) return -1;

  const sectorIndex = map.SECTORS.indexOf(sector);
  return sectorIndex >= 0 ? sectorIndex : -1;
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
 * Unlike the old bounding-circle pass, this skips sectors hidden behind one-sided walls.
 */
export function buildPortalVisibleSectors(
  index: SectorVisibilityIndex,
  map: WadMap,
  cameraX: number,
  cameraY: number,
  cameraSectorIndex: number,
  maxRadius = PORTAL_VISIBILITY_RADIUS,
  maxDepth = MAX_PORTAL_TRAVERSAL_DEPTH
): Set<number> {
  const visible = new Set<number>();
  if (cameraSectorIndex < 0 || map.SECTORS.length === 0) {
    return visible;
  }

  const cameraInSky = isSkySector(map, cameraSectorIndex);
  const queue: Array<{ sectorIndex: number; depth: number; skyChain: number }> = [
    { sectorIndex: cameraSectorIndex, depth: 0, skyChain: cameraInSky ? 0 : -1 },
  ];
  let queueHead = 0;

  while (queueHead < queue.length) {
    const { sectorIndex, depth, skyChain } = queue[queueHead++]!;
    if (visible.has(sectorIndex)) continue;

    visible.add(sectorIndex);
    if (depth >= maxDepth) continue;

    for (const neighbor of index.sectorAdjacency[sectorIndex] ?? []) {
      if (visible.has(neighbor)) continue;

      const nextSkyChain = advanceSkyChain(map, sectorIndex, neighbor, skyChain);
      if (
        !canTraversePortal(
          map,
          cameraSectorIndex,
          cameraInSky,
          sectorIndex,
          neighbor,
          nextSkyChain,
          depth
        )
      ) {
        continue;
      }

      queue.push({ sectorIndex: neighbor, depth: depth + 1, skyChain: nextSkyChain });
    }
  }

  return visible;
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
  map: WadMap,
  cameraSectorIndex: number,
  cameraInSky: boolean,
  fromSectorIndex: number,
  toSectorIndex: number,
  skyChain: number,
  fromDepth: number
): boolean {
  const toIsSky = isSkySector(map, toSectorIndex);
  const fromIsSky = isSkySector(map, fromSectorIndex);

  if (cameraInSky) {
    if (fromIsSky && toIsSky && skyChain >= MAX_SKY_PORTAL_CHAIN) {
      return false;
    }
    return true;
  }

  if (toSectorIndex === cameraSectorIndex || fromSectorIndex === cameraSectorIndex) {
    return true;
  }

  // Walk through indoor portals (doorways, stairs, corridors).
  if (!fromIsSky && !toIsSky) {
    return true;
  }

  // Window from indoor room to outdoor sky.
  if (toIsSky && !fromIsSky) {
    return true;
  }

  // Outdoor sky graph — limit how far sky sectors chain (prevents whole-map flood).
  if (toIsSky && fromIsSky) {
    return skyChain >= 0 && skyChain < MAX_SKY_PORTAL_CHAIN;
  }

  // Outdoor → indoor: direct window from the outdoor sector; shallow depth from indoor camera.
  if (fromIsSky && !toIsSky) {
    if (cameraInSky) {
      return true;
    }
    return (
      sectorsSharePortalLine(map, fromSectorIndex, toSectorIndex) &&
      fromDepth <= INDOOR_CAMERA_MAX_SKY_INDOOR_DEPTH
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

export function isDrawVisible(
  center: [number, number, number],
  cameraPos: [number, number, number],
  visibilityDistance: number,
  visibleSectors: Set<number> | null,
  sectorIndex: number,
  cameraSectorIndex = -1,
  horizontalOnly = false,
  relatedSectorIndices: readonly number[] = []
): boolean {
  if (!isSectorPotentiallyVisible(sectorIndex, visibleSectors, relatedSectorIndices)) {
    return false;
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
