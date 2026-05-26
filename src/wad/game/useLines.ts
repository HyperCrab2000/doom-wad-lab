import { getDoorSpecial } from '@/wad/game/lineSpecials';
import { getFloorMoverSpecial } from '@/wad/game/floorMoverSpecials';

function isUseActivatableSpecial(special: number): boolean {
  const door = getDoorSpecial(special);
  if (door?.activation === 'switch') return true;
  const floor = getFloorMoverSpecial(special);
  if (floor?.activation === 'switch') return true;
  return false;
}
import { LineDef } from '@/wad/interfaces/LineDef';
import { WadMap } from '@/wad/interfaces/WadMap';

/** Doom USERANGE from p_spec.c */
export const USE_RANGE = 64;

/** Max angle (radians) from view yaw for a linedef to be considered targeted. */
const USE_ANGLE = Math.PI / 2;

export interface UseLineOptions {
  /** Player view yaw in world space (radians). When set, prefer lines in front of the player. */
  yaw?: number;
}

export function findUseLine(
  map: WadMap,
  position: { x: number; y: number },
  options: UseLineOptions = {}
): { lineIndex: number; line: LineDef } | null {
  const candidates: Array<{
    lineIndex: number;
    line: LineDef;
    distance: number;
    viewAngle: number;
  }> = [];

  for (let lineIndex = 0; lineIndex < map.LINEDEFS.length; lineIndex++) {
    const line = map.LINEDEFS[lineIndex];
    if (!isUseActivatableSpecial(line.special)) continue;

    const v1 = map.VERTEXES[line.v1];
    const v2 = map.VERTEXES[line.v2];
    const distance = doomUseDistance(position, v1, v2);
    if (distance > USE_RANGE) continue;
    if (!isOnFrontSide(position, v1, v2)) continue;

    candidates.push({
      lineIndex,
      line,
      distance,
      viewAngle: options.yaw === undefined ? 0 : angleToLine(position, options.yaw, v1, v2),
    });
  }

  if (candidates.length === 0) return null;

  const inView = candidates.filter((candidate) => candidate.viewAngle <= USE_ANGLE);
  const pool = inView.length > 0 ? inView : candidates;
  pool.sort((a, b) => a.distance - b.distance || a.viewAngle - b.viewAngle);
  const best = pool[0];
  return { lineIndex: best.lineIndex, line: best.line };
}

export function findCrossedWalkLines(
  map: WadMap,
  from: { x: number; y: number },
  to: { x: number; y: number }
): Array<{ lineIndex: number; line: LineDef }> {
  const crossed: Array<{ lineIndex: number; line: LineDef }> = [];

  for (let lineIndex = 0; lineIndex < map.LINEDEFS.length; lineIndex++) {
    const line = map.LINEDEFS[lineIndex];
    const door = getDoorSpecial(line.special);
    const floor = getFloorMoverSpecial(line.special);
    if (door?.activation !== 'walk' && floor?.activation !== 'walk') continue;

    const v1 = map.VERTEXES[line.v1];
    const v2 = map.VERTEXES[line.v2];
    if (segmentsCross(from, to, v1, v2)) {
      crossed.push({ lineIndex, line });
    }
  }

  return crossed;
}

/**
 * Doom P_PointOnLineSide (p_maputl.c): front side when
 * `(y - v1.y) * (v2.x - v1.x) < (x - v1.x) * (v2.y - v1.y)`.
 * P_UseLines skips the back side.
 */
export function isOnFrontSide(
  position: { x: number; y: number },
  v1: { x: number; y: number },
  v2: { x: number; y: number }
): boolean {
  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const left = dy * (position.x - v1.x);
  const right = (position.y - v1.y) * dx;
  return right < left;
}

/** Doom P_AproxDistance check used by P_UseLines. */
export function doomUseDistance(
  point: { x: number; y: number },
  v1: { x: number; y: number },
  v2: { x: number; y: number }
): number {
  return (
    doomApproxDistance(point.x, point.y, v1.x, v1.y) +
    doomApproxDistance(point.x, point.y, v2.x, v2.y) -
    doomApproxDistance(v1.x, v1.y, v2.x, v2.y)
  );
}

function doomApproxDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

function angleToLine(
  position: { x: number; y: number },
  yaw: number,
  v1: { x: number; y: number },
  v2: { x: number; y: number }
): number {
  const midX = (v1.x + v2.x) * 0.5;
  const midY = (v1.y + v2.y) * 0.5;
  const targetAngle = Math.atan2(midY - position.y, midX - position.x);
  let diff = targetAngle - yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

function segmentsCross(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number }
) {
  const d1 = direction(b1, b2, a1);
  const d2 = direction(b1, b2, a2);
  const d3 = direction(a1, a2, b1);
  const d4 = direction(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function direction(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
) {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}
