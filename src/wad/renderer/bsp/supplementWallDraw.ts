import type { WadMap } from '@/wad/interfaces/WadMap';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import {
  traceClassicBsp,
  type ClassicBspTrace,
} from '@/wad/renderer/bsp/classicBspTrace';
import type { WallDrawEntry } from '@/wad/renderer/bsp/bspVisibility';

/** Doom software backface test (R_PointToAngle v1/v2), not pseudo-angle. */
export function isVanillaBackface(
  viewX: number,
  viewY: number,
  v1x: number,
  v1y: number,
  v2x: number,
  v2y: number
): boolean {
  const angle1 = doomBspAngle(viewX, viewY, v1x, v1y);
  const angle2 = doomBspAngle(viewX, viewY, v2x, v2y);
  return angle1 >= angle2;
}

function doomBspAngle(viewX: number, viewY: number, x: number, y: number): number {
  let angle = Math.atan2(y - viewY, x - viewX);
  if (angle < 0) {
    angle += Math.PI * 2;
  }
  return angle;
}

function sideIndexForSeg(map: WadMap, lineIndex: number, segIndex: number): number {
  const line = map.LINEDEFS[lineIndex];
  const seg = map.SEGS[segIndex];
  if (!line || !seg) return -1;
  return line.sidenum[seg.side & 1];
}

/**
 * Extend BSP wall draw list so the textured renderer matches what the map
 * geometry supports when pseudo-angle BSP rejects nearby walls:
 *
 * - `clip` + visited subsector + one-sided → draw (E1M1 pillar windows)
 * - `backface` + one-sided + vanilla front face → draw (pseudo-angle false reject)
 */
export function supplementWallDrawFromTrace(
  map: WadMap,
  index: BspRenderIndex,
  viewX: number,
  viewY: number,
  viewYaw: number,
  wallDrawOrder: readonly WallDrawEntry[],
  visibleSubsectors: ReadonlySet<number>,
  trace?: ClassicBspTrace
): WallDrawEntry[] {
  const drawn = new Set(wallDrawOrder.map((entry) => entry.lineIndex));
  const classicTrace =
    trace ??
    traceClassicBsp({
      map,
      index,
      viewX,
      viewY,
      viewYaw,
    });

  const extra: WallDrawEntry[] = [];

  for (const entry of classicTrace.segByIndex.values()) {
    if (!visibleSubsectors.has(entry.subsectorIndex)) continue;
    if (drawn.has(entry.lineIndex)) continue;

    const line = map.LINEDEFS[entry.lineIndex];
    if (!line || line.sidenum[1] >= 0) continue;

    const seg = map.SEGS[entry.segIndex];
    if (!seg) continue;

    const v1 = map.VERTEXES[seg.v1];
    const v2 = map.VERTEXES[seg.v2];
    if (!v1 || !v2) continue;

    const sideIndex = sideIndexForSeg(map, entry.lineIndex, entry.segIndex);
    if (sideIndex < 0) continue;

    if (entry.reason === 'clip') {
      extra.push({
        lineIndex: entry.lineIndex,
        sideDefIndex: sideIndex,
        segIndex: entry.segIndex,
      });
      drawn.add(entry.lineIndex);
      continue;
    }

    if (
      entry.reason === 'backface' &&
      !isVanillaBackface(viewX, viewY, v1.x, v1.y, v2.x, v2.y)
    ) {
      extra.push({
        lineIndex: entry.lineIndex,
        sideDefIndex: sideIndex,
        segIndex: entry.segIndex,
      });
      drawn.add(entry.lineIndex);
    }
  }

  if (extra.length === 0) return [...wallDrawOrder];
  return [...wallDrawOrder, ...extra];
}

/**
 * Draw every linedef touched by a visited BSP subsector. The angular clipper
 * rejects many nearby walls that still have baked geometry (E1M1 spawn area).
 */
export function supplementWallsFromVisibleSubsectors(
  map: WadMap,
  index: BspRenderIndex,
  wallDrawOrder: readonly WallDrawEntry[],
  visibleSubsectors: ReadonlySet<number>
): WallDrawEntry[] {
  const drawn = new Set(wallDrawOrder.map((entry) => entry.lineIndex));
  const extra: WallDrawEntry[] = [];

  for (const subsectorIndex of visibleSubsectors) {
    const segIndices = index.subsectorSegs[subsectorIndex] ?? [];
    for (const segIndex of segIndices) {
      const lineIndex = index.segLineIndex[segIndex] ?? -1;
      if (lineIndex < 0 || drawn.has(lineIndex)) continue;

      const line = map.LINEDEFS[lineIndex];
      const seg = map.SEGS[segIndex];
      if (!line || !seg) continue;

      const sideIndex = line.sidenum[seg.side & 1];
      if (sideIndex < 0) continue;

      extra.push({ lineIndex, sideDefIndex: sideIndex, segIndex });
      drawn.add(lineIndex);
    }
  }

  if (extra.length === 0) return [...wallDrawOrder];
  return [...wallDrawOrder, ...extra];
}

/**
 * For two-sided lines where ONE side has geometry and the other doesn't,
 * submit the side with geometry if it wasn't already captured by the BSP.
 * This handles asymmetric step walls (e.g. SLADWALL on sector 32 side, '-' on 33 side).
 */
export function supplementTwoSidedAsymmetricWalls(
  map: WadMap,
  wallDrawOrder: readonly WallDrawEntry[],
  visibleSubsectors: ReadonlySet<number>,
  index: BspRenderIndex
): WallDrawEntry[] {
  const drawn = new Set(wallDrawOrder.map((e) => e.lineIndex));
  const extra: WallDrawEntry[] = [];

  function hasTexture(sideIndex: number): boolean {
    if (sideIndex < 0) return false;
    const side = map.SIDEDEFS[sideIndex];
    if (!side) return false;
    return (
      (!!side.topTexture && side.topTexture !== '-') ||
      (!!side.midTexture && side.midTexture !== '-') ||
      (!!side.bottomTexture && side.bottomTexture !== '-')
    );
  }

  const processedLines = new Set<number>();

  for (const subsectorIndex of visibleSubsectors) {
    const segIndices = index.subsectorSegs[subsectorIndex] ?? [];
    for (const segIndex of segIndices) {
      const lineIndex = index.segLineIndex[segIndex] ?? -1;
      if (lineIndex < 0 || drawn.has(lineIndex) || processedLines.has(lineIndex)) continue;

      const line = map.LINEDEFS[lineIndex];
      // Only handle two-sided lines
      if (!line || line.sidenum[1] < 0) continue;

      const side0HasTex = hasTexture(line.sidenum[0]);
      const side1HasTex = hasTexture(line.sidenum[1]);

      // Skip if both sides have texture (BSP should handle these)
      // or neither side has texture (nothing to draw)
      if (side0HasTex === side1HasTex) continue;

      // Submit the side WITH geometry
      const sideDefIndex = side0HasTex ? line.sidenum[0] : line.sidenum[1];
      processedLines.add(lineIndex);
      extra.push({ lineIndex, sideDefIndex, segIndex });
    }
  }

  if (extra.length === 0) return [...wallDrawOrder];
  return [...wallDrawOrder, ...extra];
}

/**
 * GZDoom draws walls from BSP `AddLine` only. The trace supplement adds one-sided
 * walls the pseudo-angle clipper rejected (E1M1 pillar windows) — not every linedef
 * in visited subsectors, which over-draws wrong textures.
 *
 * Additionally, for two-sided lines where only one side has geometry (asymmetric steps),
 * we supplement those from visited subsectors.
 */
export function buildSupplementedWallDrawOrder(
  map: WadMap,
  index: BspRenderIndex,
  viewX: number,
  viewY: number,
  viewYaw: number,
  wallDrawOrder: readonly WallDrawEntry[],
  visibleSubsectors: ReadonlySet<number>,
  trace?: ClassicBspTrace
): WallDrawEntry[] {
  const afterTrace = supplementWallDrawFromTrace(
    map,
    index,
    viewX,
    viewY,
    viewYaw,
    wallDrawOrder,
    visibleSubsectors,
    trace
  );
  return supplementTwoSidedAsymmetricWalls(map, afterTrace, visibleSubsectors, index);
}
