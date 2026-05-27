import { Sector } from '@/wad/interfaces/Sector';
import { Triangle } from '@/wad/interfaces/Triangle';
import { Vertex } from '@/wad/interfaces/Vertex';
import { WadMap } from '@/wad/interfaces/WadMap';
import { AabbCache, AabbPointType } from '@/wad/interfaces/TriangleCache';
import { findTrianglesAtPosition } from '@/wad/utils/findTrianglesAtPosition';
import { insertAabbCacheItem } from '@/wad/utils/insertAabbCache';
import { pointInTriangle } from '@/wad/utils/pointInTriangle';

export interface TriangleHashObject {
  triangle: Triangle;
  sector: Sector;
  sectorIndex: number;
}

export type SectorTriangleHash = AabbCache<TriangleHashObject>;

export function buildSectorTriangleHash(
  map: WadMap,
  sectorTriangles: Record<number, Triangle[]>
): SectorTriangleHash {
  const hash: SectorTriangleHash = { x: [], y: [] };

  map.SECTORS.forEach((sector, sectorIndex) => {
    const triangles = sectorTriangles[sectorIndex];
    if (!triangles) return;

    for (const triangle of triangles) {
      const obj: TriangleHashObject = { triangle, sector, sectorIndex };
      insertAabbCacheItem(hash.x, {
        val: Math.min(triangle[0].x, triangle[1].x, triangle[2].x),
        type: AabbPointType.min,
        obj,
      });
      insertAabbCacheItem(hash.x, {
        val: Math.max(triangle[0].x, triangle[1].x, triangle[2].x),
        type: AabbPointType.max,
        obj,
      });
      insertAabbCacheItem(hash.y, {
        val: Math.min(triangle[0].y, triangle[1].y, triangle[2].y),
        type: AabbPointType.min,
        obj,
      });
      insertAabbCacheItem(hash.y, {
        val: Math.max(triangle[0].y, triangle[1].y, triangle[2].y),
        type: AabbPointType.max,
        obj,
      });
    }
  });

  return hash;
}

export function findSectorAt(
  map: WadMap,
  sectorTriangles: Record<number, Triangle[]>,
  triangleHash: SectorTriangleHash | null,
  position: Vertex
): Sector | null {
  if (triangleHash) {
    const candidates = findTrianglesAtPosition(triangleHash, position);
    for (const item of candidates.items) {
      if (pointInTriangle(position, item.triangle)) {
        return item.sector;
      }
    }
  }

  for (let sectorIndex = 0; sectorIndex < map.SECTORS.length; sectorIndex++) {
    const triangles = sectorTriangles[sectorIndex];
    if (!triangles) continue;
    if (triangles.some((triangle) => pointInTriangle(position, triangle))) {
      return map.SECTORS[sectorIndex];
    }
  }

  return findNearestSector(map, position);
}

/** Point-in-sector test without linedef nearest fallback (used for camera sector). */
export function findSectorAtPoint(
  map: WadMap,
  sectorTriangles: Record<number, Triangle[]>,
  triangleHash: SectorTriangleHash | null,
  position: Vertex
): Sector | null {
  if (triangleHash) {
    const candidates = findTrianglesAtPosition(triangleHash, position);
    for (const item of candidates.items) {
      if (pointInTriangle(position, item.triangle)) {
        return item.sector;
      }
    }
  }

  for (let sectorIndex = 0; sectorIndex < map.SECTORS.length; sectorIndex++) {
    const triangles = sectorTriangles[sectorIndex];
    if (!triangles) continue;
    if (triangles.some((triangle) => pointInTriangle(position, triangle))) {
      return map.SECTORS[sectorIndex];
    }
  }

  return null;
}

function findNearestSector(map: WadMap, position: Vertex): Sector | null {
  let nearest: { sector: Sector; distance: number } | null = null;

  for (const line of map.LINEDEFS) {
    const v1 = map.VERTEXES[line.v1];
    const v2 = map.VERTEXES[line.v2];
    const distance = distanceToSegmentSquared(position, v1, v2);

    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      const side = map.SIDEDEFS[sideIndex];
      const sector = map.SECTORS[side.sector];
      if (!sector) continue;
      if (!nearest || distance < nearest.distance) {
        nearest = { sector, distance };
      }
    }
  }

  return nearest?.sector ?? null;
}

function distanceToSegmentSquared(
  point: Vertex,
  a: Vertex,
  b: Vertex
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return (point.x - a.x) ** 2 + (point.y - a.y) ** 2;
  }

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}
