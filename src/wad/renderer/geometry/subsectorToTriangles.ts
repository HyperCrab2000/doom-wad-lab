import type { Triangle } from '@/wad/interfaces/Triangle';
import type { Vertex } from '@/wad/interfaces/Vertex';
import type { WadMap } from '@/wad/interfaces/WadMap';

/**
 * Unique vertices of a subsector, ordered counter-clockwise around the centroid.
 * Classic WAD seg lists are not always a v2→v1 chain (GZDoom reorders in PrepareSegs);
 * angular sort is correct for the convex BSP subsectors we render.
 */
export function subsectorPolygonVertices(
  map: WadMap,
  segIndices: readonly number[]
): Vertex[] {
  if (segIndices.length < 2) return [];

  const byIndex = new Map<number, Vertex>();
  for (const segIndex of segIndices) {
    const seg = map.SEGS[segIndex];
    if (!seg) continue;
    const v1 = map.VERTEXES[seg.v1];
    const v2 = map.VERTEXES[seg.v2];
    if (v1) byIndex.set(seg.v1, v1);
    if (v2) byIndex.set(seg.v2, v2);
  }

  const vertices = [...byIndex.values()];
  if (vertices.length < 3) return [];

  let cx = 0;
  let cy = 0;
  for (const vertex of vertices) {
    cx += vertex.x;
    cy += vertex.y;
  }
  cx /= vertices.length;
  cy /= vertices.length;

  vertices.sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
  return vertices;
}

/** Convex fan triangulation — same topology as GZDoom `CreateVerticesForSubsector`. */
export function subsectorToTriangles(map: WadMap, segIndices: readonly number[]): Triangle[] {
  const vertices = subsectorPolygonVertices(map, segIndices);
  if (vertices.length < 3) return [];

  const triangles: Triangle[] = [];
  const v0 = vertices[0]!;
  for (let i = 1; i < vertices.length - 1; i++) {
    triangles.push([v0, vertices[i]!, vertices[i + 1]!]);
  }
  return triangles;
}

export function subsectorSignedArea(map: WadMap, segIndices: readonly number[]): number {
  const vertices = subsectorPolygonVertices(map, segIndices);
  if (vertices.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}
