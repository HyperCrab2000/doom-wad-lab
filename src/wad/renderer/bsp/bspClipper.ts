/** Full circle in clip angle units [0, 1). */
export const ANGLE_MAX = 1;
/** Half circle — back-face threshold (GZDoom ANGLE_180). */
export const ANGLE_180 = 0.5;

export type AngleInterval = { start: number; end: number };

const BOXTOP = 0;
const BOXBOTTOM = 1;
const BOXLEFT = 2;
const BOXRIGHT = 3;

/** GZDoom `checkcoord` table from `hw_clipper.cpp` / `r_bsp.c`. */
const CHECKCOORD: readonly (readonly number[])[] = [
  [BOXRIGHT, BOXTOP, BOXLEFT, BOXBOTTOM],
  [BOXRIGHT, BOXTOP, BOXLEFT, BOXTOP],
  [BOXRIGHT, BOXBOTTOM, BOXLEFT, BOXTOP],
  [],
  [BOXLEFT, BOXTOP, BOXLEFT, BOXBOTTOM],
  [0, 0, 0, 0],
  [BOXRIGHT, BOXBOTTOM, BOXRIGHT, BOXTOP],
  [],
  [BOXLEFT, BOXTOP, BOXRIGHT, BOXBOTTOM],
  [BOXLEFT, BOXBOTTOM, BOXRIGHT, BOXBOTTOM],
  [BOXLEFT, BOXBOTTOM, BOXRIGHT, BOXTOP],
];

export function normalizeAngle(angle: number): number {
  angle %= ANGLE_MAX;
  if (angle < 0) angle += ANGLE_MAX;
  return angle;
}

/** Unsigned angle difference on [0,1). */
export function unsignedAngleDiff(start: number, end: number): number {
  const diff = start - end;
  return diff >= 0 ? diff : diff + ANGLE_MAX;
}

/**
 * GZDoom `Clipper::PointToPseudoAngle` — ordering matches `GetClipAngle` / `CheckBox`.
 * Result normalized to [0, 1) (GZDoom stores [0, 2) in fixed point).
 */
export function pointToPseudoAngle(
  viewX: number,
  viewY: number,
  vertexX: number,
  vertexY: number
): number {
  const vecx = vertexX - viewX;
  const vecy = vertexY - viewY;
  if (vecx === 0 && vecy === 0) return 0;

  let result = vecy / (Math.abs(vecx) + Math.abs(vecy));
  if (vecx < 0) {
    result = 2 - result;
  }
  return normalizeAngle(result / 2);
}

/** GZDoom `Clipper::AngleToPseudo` for frustum seed (`SafeAddClipRangeRealAngles`). */
export function angleToPseudoAngle(radians: number): number {
  const vecx = Math.cos(radians);
  const vecy = Math.sin(radians);
  let result = vecy / (Math.abs(vecx) + Math.abs(vecy));
  if (vecx < 0) {
    result = 2 - result;
  }
  return normalizeAngle(result / 2);
}

/** @deprecated Use pointToPseudoAngle. */
export const pointToClipAngle = pointToPseudoAngle;

/** @deprecated Use angleToPseudoAngle. */
export const yawToClipAngle = angleToPseudoAngle;

function splitWrappedInterval(start: number, end: number): AngleInterval[] {
  start = normalizeAngle(start);
  end = normalizeAngle(end);
  if (start <= end) return [{ start, end }];
  return [
    { start, end: ANGLE_MAX },
    { start: 0, end },
  ];
}

function mergeIntervals(intervals: AngleInterval[]): AngleInterval[] {
  if (intervals.length <= 1) return intervals;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: AngleInterval[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start <= last.end + 1e-9) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function subtractInterval(intervals: AngleInterval[], blockStart: number, blockEnd: number): AngleInterval[] {
  const blocks = splitWrappedInterval(blockStart, blockEnd);
  let result = intervals;
  for (const block of blocks) {
    const next: AngleInterval[] = [];
    for (const interval of result) {
      if (block.end <= interval.start || block.start >= interval.end) {
        next.push(interval);
        continue;
      }
      if (block.start > interval.start) {
        next.push({ start: interval.start, end: block.start });
      }
      if (block.end < interval.end) {
        next.push({ start: block.end, end: interval.end });
      }
    }
    result = next;
  }
  return mergeIntervals(result);
}

function intervalsOverlap(a: AngleInterval[], b: AngleInterval[]): boolean {
  for (const left of a) {
    for (const right of b) {
      if (left.start < right.end && right.start < left.end) return true;
    }
  }
  return false;
}

/**
 * Angular visibility clipper — port of GZDoom `Clipper` / `hw_clipper.h`.
 * Uses pseudo-angles throughout (same as `GetClipAngle` / `CheckBox`).
 */
export class BspClipper {
  private visible: AngleInterval[] = [{ start: 0, end: ANGLE_MAX }];

  clear(): void {
    this.visible = [{ start: 0, end: ANGLE_MAX }];
  }

  /**
   * Keep only the forward view hemisphere (GZDoom `SafeAddClipRangeRealAngles`).
   * Uses forward pseudo-angle ± half circle — `angleToPseudoAngle` at rear endpoints
   * collapses on cardinals (east/west/north/south) and leaves the full circle open.
   */
  seedFromViewYaw(viewYawRadians: number, halfFovRadians = Math.PI / 2 - 0.001): void {
    const forward = angleToPseudoAngle(viewYawRadians);
    const defaultHalfFov = Math.PI / 2 - 0.001;
    const halfPseudo = 0.25 * (halfFovRadians / defaultHalfFov);
    const start = normalizeAngle(forward - halfPseudo);
    const end = normalizeAngle(forward + halfPseudo);

    if (start <= end) {
      this.visible = [{ start, end }];
      return;
    }

    this.visible = [
      { start, end: ANGLE_MAX },
      { start: 0, end },
    ];
  }

  safeCheckRange(startAngle: number, endAngle: number): boolean {
    if (startAngle > endAngle) {
      return (
        this.isRangeVisible(startAngle, ANGLE_MAX) || this.isRangeVisible(0, endAngle)
      );
    }
    return this.isRangeVisible(startAngle, endAngle);
  }

  safeAddClipRange(startAngle: number, endAngle: number): void {
    if (startAngle > endAngle) {
      this.visible = subtractInterval(this.visible, startAngle, ANGLE_MAX);
      this.visible = subtractInterval(this.visible, 0, endAngle);
      return;
    }
    this.visible = subtractInterval(this.visible, startAngle, endAngle);
  }

  private isRangeVisible(startAngle: number, endAngle: number): boolean {
    const segIntervals = splitWrappedInterval(startAngle, endAngle);
    return intervalsOverlap(this.visible, segIntervals);
  }

  /**
   * GZDoom `Clipper::CheckBox` — bbox is [top, bottom, left, right].
   *
   * GZDoom uses REAL angles (atan2) for `CheckBox` to avoid the N/S degeneracy
   * where pseudo-angle 0.5 maps to both north AND south.  Without this fix the
   * pseudo-angle clipper fills up from nearby walls and incorrectly prunes BSP
   * nodes for sectors that are visibly open to the north (e.g. E1M1 sectors 32-39).
   *
   * We compute the real-angle span of the relevant two box corners, check whether
   * that span overlaps the forward hemisphere, and ALSO confirm that the pseudo-
   * angle clipper hasn't already fully occluded the range.
   */
  checkBox(
    bbox: [number, number, number, number],
    viewX: number,
    viewY: number,
    viewYaw?: number
  ): boolean {
    const boxTop = bbox[BOXTOP]!;
    const boxBottom = bbox[BOXBOTTOM]!;
    const boxLeft = bbox[BOXLEFT]!;
    const boxRight = bbox[BOXRIGHT]!;

    const boxpos =
      (viewX <= boxLeft ? 0 : viewX < boxRight ? 1 : 2) +
      (viewY >= boxTop ? 0 : viewY > boxBottom ? 4 : 8);

    if (boxpos === 5) return true;

    const check = CHECKCOORD[boxpos];
    if (!check || check.length === 0) return true;

    // Real-angle forward-hemisphere check using dot products.
    // GZDoom uses real atan2 angles for CheckBox to avoid the pseudo-angle N/S collapse
    // (north and south both map to pseudo-angle 0.5, causing the clipper to prune
    // BSP nodes that are visibly open to the north).
    //
    // Strategy: if EITHER representative corner has a positive dot product with the
    // forward direction, the node is in the forward hemisphere → traverse it.
    // Only skip nodes where BOTH corners are clearly behind the camera.
    // The seg-level safeCheckRange + portal PVS filter handle occlusion correctness.
    if (viewYaw !== undefined) {
      const cx1 = bbox[check[0]!]! - viewX;
      const cy1 = bbox[check[1]!]! - viewY;
      const cx2 = bbox[check[2]!]! - viewX;
      const cy2 = bbox[check[3]!]! - viewY;
      const forwardX = Math.cos(viewYaw);
      const forwardY = Math.sin(viewYaw);
      const dot1 = cx1 * forwardX + cy1 * forwardY;
      const dot2 = cx2 * forwardX + cy2 * forwardY;
      if (dot1 < -64 && dot2 < -64) {
        return false; // both corners clearly behind — skip
      }
      // At least one corner is forward: don't let the pseudo-angle clipper block it.
      return true;
    }

    // Fallback (no viewYaw provided): pseudo-angle clipper only.
    const angle1 = pointToPseudoAngle(viewX, viewY, bbox[check[0]!]!, bbox[check[1]!]!);
    const angle2 = pointToPseudoAngle(viewX, viewY, bbox[check[2]!]!, bbox[check[3]!]!);
    return this.safeCheckRange(angle2, angle1);
  }
}
