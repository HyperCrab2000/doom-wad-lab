import type { WadMap } from '@/wad/interfaces/WadMap';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import {
  traceClassicBsp,
  type ClassicBspTrace,
  type SegVisibilityReason,
} from '@/wad/renderer/bsp/classicBspTrace';
import type { WallDrawEntry } from '@/wad/renderer/bsp/bspVisibility';
import { hwWallProcessSide } from '@/wad/renderer/bsp/hwWallProcess';
import {
  gzdoomScreenZ,
  gzdoomViewport,
  gzdoomWallScreenX,
  gzdoomWallScreenY,
} from '@/wad/parity/frame/gzdoomScreenZ';

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
  if (!line || !seg || !line.sidenum) return -1;
  return line.sidenum[seg.side & 1] ?? -1;
}

/**
 * Extend BSP wall draw list so the textured renderer matches what the map
 * geometry supports when pseudo-angle BSP rejects nearby walls:
 *
 * - `clip` + visited subsector + one-sided → draw (E1M1 pillar windows)
 *
 * Backface trace entries are intentionally not supplemented — the vanilla-angle
 * override caused walls to pop in/out when the camera crossed sub-pixel edges.
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
    if (!line?.sidenum || line.sidenum[1]! >= 0) continue;

    const seg = map.SEGS[entry.segIndex];
    if (!seg) continue;

    const sideIndex = sideIndexForSeg(map, entry.lineIndex, entry.segIndex);
    if (sideIndex < 0) continue;

    if (entry.reason === 'clip') {
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

export type ClipWallScreenBand = {
  minPfX: number;
  minPfY: number;
  maxPfY: number;
};

export type ClipWallSupplementOptions = {
  screenBand?: ClipWallScreenBand;
  /** When set, only these linedefs are candidates (E1M1 spawn east steps). */
  lineWhitelist?: ReadonlySet<number>;
};

export type ClipWallSupplementResult = {
  wallDrawOrder: WallDrawEntry[];
  lineIndices: ReadonlySet<number>;
  sectorIndices: ReadonlySet<number>;
};

function textureLookupFromMap(map: WadMap): Record<string, WallTexture> {
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }
  const texturesByName: Record<string, WallTexture> = {};
  for (const name of texNames) {
    texturesByName[name] = {
      name,
      width: 64,
      height: 128,
      transparent: false,
      graphics: {} as never,
    };
  }
  return texturesByName;
}

function lineCoversPlayfieldBand(
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  lineIndex: number,
  viewX: number,
  viewY: number,
  viewYaw: number,
  cameraEyeY: number,
  band: ClipWallScreenBand,
): boolean {
  const line = map.LINEDEFS[lineIndex];
  if (!line) return false;
  const vp = gzdoomViewport(320, 168, viewYaw);
  for (const sideDefIndex of line.sidenum) {
    if (sideDefIndex < 0) continue;
    const v1 = map.VERTEXES[line.v1];
    const v2 = map.VERTEXES[line.v2];
    if (!v1 || !v2) continue;
    const sx1 = gzdoomWallScreenX(v1.x, v1.y, viewX, viewY, vp);
    const sx2 = gzdoomWallScreenX(v2.x, v2.y, viewX, viewY, vp);
    if (sx1 == null && sx2 == null) continue;
    const maxSx = Math.max(sx1 ?? -Infinity, sx2 ?? -Infinity);
    if (maxSx < band.minPfX) continue;
    const sz = gzdoomScreenZ((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, viewX, viewY, viewYaw);
    const bands = hwWallProcessSide({
      map,
      lineDef: line,
      sideDefIndex,
      otherSideDefIndex:
        line.sidenum[0] === sideDefIndex ? line.sidenum[1] : line.sidenum[0],
      texturesByName,
    });
    for (const wallBand of bands) {
      const yTop = gzdoomWallScreenY(wallBand.top, cameraEyeY, sz, vp);
      const yBot = gzdoomWallScreenY(wallBand.bottom, cameraEyeY, sz, vp);
      const minY = Math.min(yTop, yBot);
      const maxY = Math.max(yTop, yBot);
      if (maxY >= band.minPfY && minY <= band.maxPfY) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Two-sided clip walls outside the flat mesh pool, optionally gated by playfield band
 * (E1M1 east computer room at spawn — mid-lower right edge).
 */
export function supplementTwoSidedClipWallsFromTrace(
  map: WadMap,
  index: BspRenderIndex,
  viewX: number,
  viewY: number,
  viewYaw: number,
  cameraEyeY: number,
  wallDrawOrder: readonly WallDrawEntry[],
  visibleSubsectors: ReadonlySet<number>,
  meshFlatVisibleSectors: ReadonlySet<number>,
  options?: ClipWallSupplementOptions,
  trace?: ClassicBspTrace,
): ClipWallSupplementResult {
  const screenBand = options?.screenBand;
  const lineWhitelist = options?.lineWhitelist;
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
  const texturesByName = screenBand ? textureLookupFromMap(map) : null;
  const extra: WallDrawEntry[] = [];
  const lineIndices = new Set<number>();
  const sectorIndices = new Set<number>();

  for (const entry of classicTrace.segByIndex.values()) {
    if (!visibleSubsectors.has(entry.subsectorIndex)) continue;
    if (drawn.has(entry.lineIndex)) continue;
    if (entry.reason !== 'clip') continue;

    const line = map.LINEDEFS[entry.lineIndex];
    if (!line || line.sidenum[1] < 0) continue;
    if (lineWhitelist && !lineWhitelist.has(entry.lineIndex)) continue;

    const sectorIndex = index.subsectorToSector[entry.subsectorIndex] ?? -1;
    if (sectorIndex < 0 || meshFlatVisibleSectors.has(sectorIndex)) continue;

    if (
      screenBand &&
      texturesByName &&
      !lineCoversPlayfieldBand(
        map,
        texturesByName,
        entry.lineIndex,
        viewX,
        viewY,
        viewYaw,
        cameraEyeY,
        screenBand,
      )
    ) {
      continue;
    }

    const sideIndex = sideIndexForSeg(map, entry.lineIndex, entry.segIndex);
    if (sideIndex < 0) continue;

    extra.push({
      lineIndex: entry.lineIndex,
      sideDefIndex: sideIndex,
      segIndex: entry.segIndex,
    });
    drawn.add(entry.lineIndex);
    lineIndices.add(entry.lineIndex);
    sectorIndices.add(sectorIndex);
    const sideSector = map.SIDEDEFS[sideIndex]?.sector;
    if (sideSector !== undefined) {
      sectorIndices.add(sideSector);
    }
  }

  if (extra.length === 0) {
    return { wallDrawOrder: [...wallDrawOrder], lineIndices, sectorIndices };
  }
  return {
    wallDrawOrder: [...wallDrawOrder, ...extra],
    lineIndices,
    sectorIndices,
  };
}

/**
 * Force specific linedefs from the classic trace into the draw list (E1M1 spawn
 * right-lip STARTAN3/backface walls the pseudo-angle clipper drops).
 */
export function supplementWhitelistedLinesFromTrace(
  map: WadMap,
  wallDrawOrder: readonly WallDrawEntry[],
  trace: ClassicBspTrace,
  lineWhitelist: ReadonlySet<number>,
  allowedReasons: ReadonlySet<SegVisibilityReason> = new Set(['visible', 'clip', 'backface']),
): WallDrawEntry[] {
  const drawn = new Set(wallDrawOrder.map((entry) => entry.lineIndex));
  const extra: WallDrawEntry[] = [];

  for (const entry of trace.segByIndex.values()) {
    if (!lineWhitelist.has(entry.lineIndex)) continue;
    if (drawn.has(entry.lineIndex)) continue;
    if (!allowedReasons.has(entry.reason)) continue;

    const sideIndex = sideIndexForSeg(map, entry.lineIndex, entry.segIndex);
    if (sideIndex < 0) continue;

    extra.push({
      lineIndex: entry.lineIndex,
      sideDefIndex: sideIndex,
      segIndex: entry.segIndex,
    });
    drawn.add(entry.lineIndex);
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
 * One-sided linedefs in BSP-visited subsectors that the angular clipper skipped.
 * Narrower than supplementWallsFromVisibleSubsectors (avoids two-sided over-draw).
 */
export function supplementOneSidedWallsFromVisibleSubsectors(
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
      if (!line || !seg || line.sidenum[1] >= 0) continue;

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
 * Every linedef on a BSP-flat subsector should have wall geometry when that
 * subsector is drawn — GZDoom runs AddLines inside DoSubsector, but our angular
 * clipper often rejects all segs while still visiting the subsector for flats.
 */
export function supplementWallsFromFlatSubsectors(
  map: WadMap,
  index: BspRenderIndex,
  wallDrawOrder: readonly WallDrawEntry[],
  flatSubsectorOrder: readonly number[]
): WallDrawEntry[] {
  const drawn = new Set(wallDrawOrder.map((entry) => entry.lineIndex));
  const extra: WallDrawEntry[] = [];

  for (const subsectorIndex of flatSubsectorOrder) {
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
  _flatSubsectorOrder: readonly number[],
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
    trace,
  );
  const afterAsymmetric = supplementTwoSidedAsymmetricWalls(map, afterTrace, visibleSubsectors, index);
  return supplementOneSidedWallsFromVisibleSubsectors(map, index, afterAsymmetric, visibleSubsectors);
}

/**
 * Drop one-sided pass walls the BSP angular clipper still visited (E1M1 line 42 at spawn).
 */
export function filterOneSidedBackfaceWalls(
  map: WadMap,
  viewX: number,
  viewY: number,
  wallDrawOrder: readonly WallDrawEntry[],
  preserveLineIndices?: ReadonlySet<number>,
): WallDrawEntry[] {
  return wallDrawOrder.filter((entry) => {
    if (preserveLineIndices?.has(entry.lineIndex)) return true;
    const line = map.LINEDEFS[entry.lineIndex];
    if (!line || line.sidenum[1] >= 0) return true;
    const v1 = map.VERTEXES[line.v1];
    const v2 = map.VERTEXES[line.v2];
    if (!v1 || !v2) return false;
    return !isVanillaBackface(viewX, viewY, v1.x, v1.y, v2.x, v2.y);
  });
}

/**
 * Flat anchor walls: only segs the clipper marked `visible`, plus one-sided backface cull.
 * Stops pass-wall stair flats (sector 3 at E1M1 spawn yaw 0) without dropping courtyard walls.
 */
export function filterWallDrawOrderForFlatAnchor(
  map: WadMap,
  index: BspRenderIndex,
  viewX: number,
  viewY: number,
  viewYaw: number,
  wallDrawOrder: readonly WallDrawEntry[],
  trace?: ClassicBspTrace
): WallDrawEntry[] {
  const classicTrace =
    trace ?? traceClassicBsp({ map, index, viewX, viewY, viewYaw });
  const reasonBySeg = new Map<number, SegVisibilityReason>();
  for (const entry of classicTrace.segByIndex.values()) {
    reasonBySeg.set(entry.segIndex, entry.reason);
  }

  return wallDrawOrder.filter((entry) => {
    const segReason = reasonBySeg.get(entry.segIndex);
    if (segReason != null) {
      return segReason === 'visible';
    }
    return [...classicTrace.segByIndex.values()].some(
      (candidate) => candidate.lineIndex === entry.lineIndex && candidate.reason === 'visible'
    );
  });
}
