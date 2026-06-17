import type { WadMap } from '@/wad/interfaces/WadMap';
import type { WallObject } from '@/wad/interfaces/WallObject';
import { LINE_ENDPOINT_OVERLAP } from '@/wad/renderer/geometry/mapToWalls';

const EPS = 0.05;

export interface MeshValidationIssue {
  ok: false;
  code: string;
  detail: string;
}

export type WallMeshValidation = { ok: true } | MeshValidationIssue;

export function validateWallMesh(map: WadMap, wall: WallObject): WallMeshValidation {
  if (wall.lineIndex < 0 || wall.sideDefIndex < 0) {
    return { ok: false, code: 'wall_missing_line', detail: 'wall has no linedef/side reference' };
  }

  const line = map.LINEDEFS[wall.lineIndex];
  const side = map.SIDEDEFS[wall.sideDefIndex];
  if (!line || !side) {
    return { ok: false, code: 'wall_dangling_ref', detail: `line ${wall.lineIndex} side ${wall.sideDefIndex}` };
  }

  if ((wall.sectorIndex ?? side.sector) !== side.sector) {
    return {
      ok: false,
      code: 'wall_sector_mismatch',
      detail: `wall sector ${wall.sectorIndex} != sidedef sector ${side.sector}`,
    };
  }

  const v1 = map.VERTEXES[line.v1];
  const v2 = map.VERTEXES[line.v2];
  if (!v1 || !v2) {
    return { ok: false, code: 'wall_missing_vertex', detail: `line ${wall.lineIndex} vertex missing` };
  }

  const pos = wall.position;
  const idx = wall.indices;
  if (!pos || pos.length < 12 || !idx || idx.length !== 6) {
    return { ok: false, code: 'wall_bad_topology', detail: 'expected quad wall (4 verts, 6 indices)' };
  }

  const unique = new Set<number>();
  for (let i = 0; i < idx.length; i++) unique.add(idx[i]!);
  if (unique.size !== 4) {
    return { ok: false, code: 'wall_not_quad', detail: `wall uses ${unique.size} unique vertices` };
  }

  const x1 = v1.x;
  const z1 = -v1.y;
  const x2 = v2.x;
  const z2 = -v2.y;

  for (const vi of unique) {
    const px = pos[vi * 3]!;
    const py = pos[vi * 3 + 1]!;
    const pz = pos[vi * 3 + 2]!;
    if (!pointOnExtendedSegment(px, pz, x1, z1, x2, z2, LINE_ENDPOINT_OVERLAP, EPS)) {
      return {
        ok: false,
        code: 'wall_off_linedef',
        detail: `vertex ${vi} (${px.toFixed(1)}, ${py.toFixed(1)}, ${pz.toFixed(1)}) not on linedef ${wall.lineIndex}`,
      };
    }
  }

  const ys = [...unique].map((vi) => pos[vi * 3 + 1]!);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);
  const sector = map.SECTORS[side.sector];
  if (sector && (top < sector.floorheight - 512 || bottom > sector.ceilingheight + 512)) {
    return {
      ok: false,
      code: 'wall_height_out_of_range',
      detail: `band [${bottom}, ${top}] far outside sector [${sector.floorheight}, ${sector.ceilingheight}]`,
    };
  }

  if (top - bottom < EPS) {
    return { ok: false, code: 'wall_zero_height', detail: 'degenerate wall band height' };
  }

  const nx = wall.normal[0]!;
  const ny = wall.normal[1]!;
  const nz = wall.normal[2]!;
  const nLen = Math.hypot(nx, ny, nz);
  if (Math.abs(ny) > EPS || Math.abs(nLen - 1) > 0.01) {
    return { ok: false, code: 'wall_bad_normal', detail: 'wall normal should be horizontal unit vector' };
  }

  if (!isValidQuadTriangulation(idx)) {
    return { ok: false, code: 'wall_bad_indices', detail: `indices ${Array.from(idx).join(',')}` };
  }

  return { ok: true };
}

export function wallsForSector(walls: WallObject[], sectorIndex: number): WallObject[] {
  return walls.filter((wall) => wall.sectorIndex === sectorIndex);
}

function pointOnExtendedSegment(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  overlap: number,
  eps: number
): boolean {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return Math.hypot(px - x1, pz - z1) <= eps + overlap;
  const t = ((px - x1) * dx + (pz - z1) * dz) / (len * len);
  const margin = overlap / len + eps;
  if (t < -margin || t > 1 + margin) return false;
  const qx = x1 + t * dx;
  const qz = z1 + t * dz;
  return Math.hypot(px - qx, pz - qz) <= eps;
}

function isValidQuadTriangulation(indices: Uint16Array): boolean {
  const unique = new Set<number>();
  for (let i = 0; i < indices.length; i++) unique.add(indices[i]!);
  if (unique.size !== 4) return false;

  const edgeCount = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[i + e]!;
      const b = indices[i + ((e + 1) % 3)]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }

  let boundary = 0;
  let internal = 0;
  for (const hits of edgeCount.values()) {
    if (hits === 1) boundary++;
    else if (hits === 2) internal++;
    else return false;
  }
  return boundary === 4 && internal === 1;
}
