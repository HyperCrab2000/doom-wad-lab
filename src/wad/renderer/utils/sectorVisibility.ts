import { Node } from '@/wad/interfaces/Node';
import { WadMap } from '@/wad/interfaces/WadMap';
import { Triangle } from '@/wad/interfaces/Triangle';
import { skyFlats } from '@/wad/constants/WadInfo';
import {
  DEFAULT_VISIBILITY_DISTANCE,
  MAX_PORTAL_TRAVERSAL_DEPTH,
  PORTAL_VISIBILITY_RADIUS,
  VISIBILITY_DISTANCE_MARGIN,
} from '@/wad/constants/RenderInfo';
import { findSectorAt, SectorTriangleHash } from '@/wad/renderer/utils/sectorLookup';

const SUBSECTOR_FLAG = 0x8000;

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

export function isSkySector(map: WadMap, sectorIndex: number): boolean {
  const sector = map.SECTORS[sectorIndex];
  if (!sector) return false;
  return (
    skyFlats.indexOf(sector.ceilingpic) >= 0 || skyFlats.indexOf(sector.floorpic) >= 0
  );
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
  if (nodeIndex & SUBSECTOR_FLAG) {
    return nodeIndex & ~SUBSECTOR_FLAG;
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

export function findCameraSectorIndex(
  map: WadMap,
  sectorTriangles: Record<number, Triangle[]>,
  triangleHash: SectorTriangleHash | null,
  cameraPos: [number, number, number]
): number {
  const sector = findSectorAt(map, sectorTriangles, triangleHash, {
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

  const maxRadiusSq = maxRadius * maxRadius;
  const cameraInSky = isSkySector(map, cameraSectorIndex);
  const queue: Array<{ sectorIndex: number; depth: number }> = [
    { sectorIndex: cameraSectorIndex, depth: 0 },
  ];

  while (queue.length > 0) {
    const { sectorIndex, depth } = queue.shift()!;
    if (visible.has(sectorIndex)) continue;

    const bounds = index.sectorBounds[sectorIndex];
    if (
      sectorIndex !== cameraSectorIndex &&
      bounds &&
      !isBoundsWithinRadius(bounds, cameraX, cameraY, maxRadiusSq)
    ) {
      continue;
    }

    visible.add(sectorIndex);
    if (depth >= maxDepth) continue;

    for (const neighbor of index.sectorAdjacency[sectorIndex] ?? []) {
      if (visible.has(neighbor)) continue;

      if (!canTraversePortal(map, cameraSectorIndex, cameraInSky, sectorIndex, neighbor)) {
        continue;
      }

      const neighborBounds = index.sectorBounds[neighbor];
      if (
        neighborBounds &&
        !isBoundsWithinRadius(neighborBounds, cameraX, cameraY, maxRadiusSq)
      ) {
        continue;
      }
      queue.push({ sectorIndex: neighbor, depth: depth + 1 });
    }
  }

  return visible;
}

/**
 * When the camera is indoors, only the camera sector and outdoor sky sectors
 * should be reachable. This prevents distant indoor areas from leaking into
 * sky views through the outdoor sector graph (E1M1 start window, etc.).
 */
function canTraversePortal(
  map: WadMap,
  cameraSectorIndex: number,
  cameraInSky: boolean,
  fromSectorIndex: number,
  toSectorIndex: number
): boolean {
  if (cameraInSky) {
    return true;
  }

  if (toSectorIndex === cameraSectorIndex) {
    return true;
  }

  const toIsSky = isSkySector(map, toSectorIndex);
  const fromIsSky = isSkySector(map, fromSectorIndex);

  // Direct portal from the camera room (stacked floors, adjacent rooms).
  if (fromSectorIndex === cameraSectorIndex) {
    return true;
  }

  if (toIsSky) {
    return true;
  }

  // Do not walk from outdoor sky into distant indoor areas.
  if (fromIsSky) {
    return false;
  }

  return false;
}

function isBoundsWithinRadius(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  cameraX: number,
  cameraY: number,
  maxRadiusSq: number
): boolean {
  const closestX = Math.max(bounds.minX, Math.min(cameraX, bounds.maxX));
  const closestY = Math.max(bounds.minY, Math.min(cameraY, bounds.maxY));
  const dx = closestX - cameraX;
  const dy = closestY - cameraY;
  return dx * dx + dy * dy <= maxRadiusSq;
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
