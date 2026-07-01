import type { SceneTriangle } from './buildSceneTriangles';

export interface TriangleSpatialIndex {
  cellSize: number;
  /** (cx,cz) packed key → triangle indices */
  cells: Map<number, number[]>;
}

function cellKey(cx: number, cz: number): number {
  return (cx << 16) | (cz & 0xffff);
}

export function buildTriangleSpatialIndex(
  triangles: SceneTriangle[],
  cellSize = 256
): TriangleSpatialIndex {
  const cells = new Map<number, number[]>();

  for (let i = 0; i < triangles.length; i++) {
    const { v0, v1, v2 } = triangles[i];
    const minX = Math.min(v0[0], v1[0], v2[0]);
    const maxX = Math.max(v0[0], v1[0], v2[0]);
    const minZ = Math.min(v0[2], v1[2], v2[2]);
    const maxZ = Math.max(v0[2], v1[2], v2[2]);
    const cx0 = Math.floor(minX / cellSize);
    const cx1 = Math.floor(maxX / cellSize);
    const cz0 = Math.floor(minZ / cellSize);
    const cz1 = Math.floor(maxZ / cellSize);

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const key = cellKey(cx, cz);
        let list = cells.get(key);
        if (!list) {
          list = [];
          cells.set(key, list);
        }
        list.push(i);
      }
    }
  }

  return { cellSize, cells };
}

function addCell(
  cx: number,
  cz: number,
  cells: Map<number, number[]>,
  seen: Set<number>,
  out: number[]
): void {
  const list = cells.get(cellKey(cx, cz));
  if (!list) return;
  for (const tri of list) {
    if (seen.has(tri)) continue;
    seen.add(tri);
    out.push(tri);
  }
}

/** Collect triangle indices in grid cells the ray crosses (XZ plane). */
export function candidateTrianglesForRay(
  roX: number,
  roZ: number,
  rdX: number,
  rdZ: number,
  index: TriangleSpatialIndex,
  maxCells = 96
): number[] {
  const { cells, cellSize } = index;
  const seen = new Set<number>();
  const out: number[] = [];

  let cx = Math.floor(roX / cellSize);
  let cz = Math.floor(roZ / cellSize);
  addCell(cx, cz, cells, seen, out);

  if (Math.abs(rdX) < 1e-9 && Math.abs(rdZ) < 1e-9) {
    return out;
  }

  const stepX = rdX >= 0 ? 1 : -1;
  const stepZ = rdZ >= 0 ? 1 : -1;

  const tDeltaX = rdX !== 0 ? Math.abs(cellSize / rdX) : Number.POSITIVE_INFINITY;
  const tDeltaZ = rdZ !== 0 ? Math.abs(cellSize / rdZ) : Number.POSITIVE_INFINITY;

  const nextBoundaryX = (cell: number) => (stepX > 0 ? (cell + 1) * cellSize : cell * cellSize);
  const nextBoundaryZ = (cell: number) => (stepZ > 0 ? (cell + 1) * cellSize : cell * cellSize);

  let tMaxX =
    rdX !== 0 ? (nextBoundaryX(cx) - roX) / rdX : Number.POSITIVE_INFINITY;
  let tMaxZ =
    rdZ !== 0 ? (nextBoundaryZ(cz) - roZ) / rdZ : Number.POSITIVE_INFINITY;

  if (tMaxX < 0) tMaxX += tDeltaX * Math.ceil(-tMaxX / tDeltaX);
  if (tMaxZ < 0) tMaxZ += tDeltaZ * Math.ceil(-tMaxZ / tDeltaZ);

  for (let n = 0; n < maxCells; n++) {
    if (tMaxX < tMaxZ) {
      cx += stepX;
      if (tMaxX > 0) addCell(cx, cz, cells, seen, out);
      tMaxX += tDeltaX;
    } else {
      cz += stepZ;
      if (tMaxZ > 0) addCell(cx, cz, cells, seen, out);
      tMaxZ += tDeltaZ;
    }
  }

  return out;
}
