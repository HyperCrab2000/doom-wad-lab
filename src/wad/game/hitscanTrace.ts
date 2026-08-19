import { getLineOpening } from '@/wad/renderer/controls/doomCollision';
import type { LineDef } from '@/wad/interfaces/LineDef';
import type { WadMap } from '@/wad/interfaces/WadMap';

/** Ray vs segment; returns ray parameter t along origin→target in (0, 1], or null. */
export function raySegmentIntersectT(
  ox: number,
  oy: number,
  tx: number,
  ty: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  eps = 1e-6
): number | null {
  const rdx = tx - ox;
  const rdy = ty - oy;
  const sdx = x2 - x1;
  const sdy = y2 - y1;
  const denom = rdx * sdy - rdy * sdx;
  if (Math.abs(denom) < eps) return null;
  const t = ((x1 - ox) * sdy - (y1 - oy) * sdx) / denom;
  const u = ((x1 - ox) * rdy - (y1 - oy) * rdx) / denom;
  if (t <= eps || t > 1 + eps) return null;
  if (u < -eps || u > 1 + eps) return null;
  return t;
}

/** Whether a linedef blocks a horizontal hitscan at `shootZ` (Doom sight through gaps). */
export function lineBlocksHitscanAtZ(map: WadMap, line: LineDef, shootZ: number): boolean {
  if (!line.flags.twoSided || line.sidenum[1] < 0) return true;

  const opening = getLineOpening(map, line);
  if (!opening || opening.range <= 0) return true;

  if (line.flags.impassible || line.flags.blockAll) {
    return !(shootZ > opening.floor && shootZ < opening.ceiling);
  }

  return shootZ <= opening.floor || shootZ >= opening.ceiling;
}

export function hasHitscanLineOfSight(
  map: WadMap,
  origin: { x: number; y: number; z: number },
  target: { x: number; y: number }
): boolean {
  const dist = Math.hypot(target.x - origin.x, target.y - origin.y);
  if (dist < 1) return true;

  for (const line of map.LINEDEFS) {
    if (!lineBlocksHitscanAtZ(map, line, origin.z)) continue;
    const v1 = map.VERTEXES[line.v1];
    const v2 = map.VERTEXES[line.v2];
    const t = raySegmentIntersectT(
      origin.x,
      origin.y,
      target.x,
      target.y,
      v1.x,
      v1.y,
      v2.x,
      v2.y
    );
    if (t != null && t < 1 - 1e-4) return false;
  }
  return true;
}
