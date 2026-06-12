/**
 * Instrumented BSP visibility trace — mirrors GZDoom `hw_bsp.cpp` / Doom `r_bsp.c`.
 *
 * Same rules as `buildBspVisibleSet` in bspVisibility.ts, but records why each
 * map seg was accepted or rejected (backface, clipper, validcount, unreachable).
 */

import type { Node } from '@/wad/interfaces/Node';
import type { WadMap } from '@/wad/interfaces/WadMap';
import {
  BspClipper,
  pointToPseudoAngle,
} from '@/wad/renderer/bsp/bspClipper';
import {
  BspRenderIndex,
  childIsSubsector,
  childSubsectorIndex,
  findCameraSubsector,
  isSegFullyBehindViewer,
  normalizeBspChild,
  pointOnSide,
} from '@/wad/renderer/bsp/bspRenderIndex';
import { hwCheckClip } from '@/wad/renderer/bsp/hwCheckClip';
import type { WallDrawEntry } from '@/wad/renderer/bsp/bspVisibility';

function textureValid(name: string | undefined): boolean {
  return !!name && name !== '-';
}

/** Why a seg did or did not contribute to the visible wall list. */
export type SegVisibilityReason =
  | 'visible'
  | 'validcount'
  | 'backface'
  | 'clip'
  | 'no_linedef'
  | 'no_side'
  | 'not_reached';

export interface SegTraceEntry {
  segIndex: number;
  lineIndex: number;
  subsectorIndex: number;
  reason: SegVisibilityReason;
  startAngle: number;
  endAngle: number;
  clipsPortal: boolean;
}

export interface ClassicBspTrace {
  viewX: number;
  viewY: number;
  viewYaw: number;
  cameraSubsector: number;
  cameraSectorIndex: number;
  visitedSubsectors: ReadonlySet<number>;
  /** One entry per map seg (filled after traverse). */
  segByIndex: ReadonlyMap<number, SegTraceEntry>;
  wallDrawOrder: readonly WallDrawEntry[];
  visibleLineIndices: ReadonlySet<number>;
  visibleSectors: ReadonlySet<number>;
  stats: ClassicBspStats;
}

export interface ClassicBspStats {
  totalSegs: number;
  visitedSubsectorCount: number;
  visible: number;
  validcount: number;
  backface: number;
  clip: number;
  noLinedef: number;
  noSide: number;
  notReached: number;
  wallDrawEntries: number;
}

export interface TraceClassicBspParams {
  map: WadMap;
  index: BspRenderIndex;
  viewX: number;
  viewY: number;
  viewYaw: number;
  frustumHalf?: number;
}

/**
 * GZDoom `RenderBSP` with per-seg diagnostics.
 * Logic matches `buildBspVisibleSet` line-for-line.
 */
export function traceClassicBsp(params: TraceClassicBspParams): ClassicBspTrace {
  const { map, index, viewX, viewY, viewYaw, frustumHalf } = params;
  const clipper = new BspClipper();
  if (frustumHalf !== undefined) {
    clipper.seedFromViewYaw(viewYaw, frustumHalf);
  } else {
    clipper.seedFromViewYaw(viewYaw);
  }

  const visitedSubsectors = new Set<number>();
  const visibleSectors = new Set<number>();
  const visibleLineIndices = new Set<number>();
  const wallDrawOrder: WallDrawEntry[] = [];
  const processedLines = new Set<number>();
  const segByIndex = new Map<number, SegTraceEntry>();

  const cameraSubsector = findCameraSubsector(map, viewX, viewY);
  const cameraSectorIndex =
    cameraSubsector >= 0 ? index.subsectorToSector[cameraSubsector] ?? -1 : -1;

  const ctx: TraceContext = {
    map,
    index,
    clipper,
    viewX,
    viewY,
    viewYaw,
    visitedSubsectors,
    visibleSectors,
    visibleLineIndices,
    wallDrawOrder,
    processedLines,
    segByIndex,
  };

  const nodes = map.NODES as Node[];
  const rootNode = nodes.length > 0 ? nodes.length - 1 : -1;

  if (rootNode >= 0) {
    renderBspNode(ctx, rootNode);
  } else if (map.SSECTORS.length > 0) {
    doSubsector(ctx, 0);
  }

  for (let segIndex = 0; segIndex < map.SEGS.length; segIndex++) {
    if (segByIndex.has(segIndex)) continue;
    const lineIndex = index.segLineIndex[segIndex] ?? -1;
    let subsectorIndex = -1;
    for (let si = 0; si < index.subsectorSegs.length; si++) {
      if (index.subsectorSegs[si]?.includes(segIndex)) {
        subsectorIndex = si;
        break;
      }
    }
    segByIndex.set(segIndex, {
      segIndex,
      lineIndex,
      subsectorIndex,
      reason: 'not_reached',
      startAngle: 0,
      endAngle: 0,
      clipsPortal: false,
    });
  }

  const stats = summarizeTrace(map, segByIndex, wallDrawOrder, visitedSubsectors);

  return {
    viewX,
    viewY,
    viewYaw,
    cameraSubsector,
    cameraSectorIndex,
    visitedSubsectors,
    segByIndex,
    wallDrawOrder,
    visibleLineIndices,
    visibleSectors,
    stats,
  };
}

interface TraceContext {
  map: WadMap;
  index: BspRenderIndex;
  clipper: BspClipper;
  viewX: number;
  viewY: number;
  viewYaw: number;
  visitedSubsectors: Set<number>;
  visibleSectors: Set<number>;
  visibleLineIndices: Set<number>;
  wallDrawOrder: WallDrawEntry[];
  processedLines: Set<number>;
  segByIndex: Map<number, SegTraceEntry>;
}

function renderBspNode(ctx: TraceContext, nodeIndex: number): void {
  const nodes = ctx.map.NODES as Node[];
  let current = normalizeBspChild(nodeIndex);

  while (!childIsSubsector(current)) {
    const node = nodes[current]!;
    const side = pointOnSide(ctx.viewX, ctx.viewY, node);
    renderBspNode(ctx, normalizeBspChild(node.children[side]));

    const farSide = side ^ 1;
    const bbox = node.bbox[farSide];
    if (bbox && !ctx.clipper.checkBox(bbox, ctx.viewX, ctx.viewY, ctx.viewYaw)) {
      return;
    }

    current = normalizeBspChild(node.children[farSide]);
  }

  doSubsector(ctx, childSubsectorIndex(current));
}

function doSubsector(ctx: TraceContext, subsectorIndex: number): void {
  const sectorIndex = ctx.index.subsectorToSector[subsectorIndex];
  if (sectorIndex < 0) return;

  ctx.visitedSubsectors.add(subsectorIndex);
  ctx.visibleSectors.add(sectorIndex);

  const segIndices = ctx.index.subsectorSegs[subsectorIndex] ?? [];
  for (const segIndex of segIndices) {
    addLine(ctx, segIndex, subsectorIndex, sectorIndex);
  }
}

function addLine(
  ctx: TraceContext,
  segIndex: number,
  subsectorIndex: number,
  frontSectorIndex: number
): void {
  const seg = ctx.map.SEGS[segIndex];
  if (!seg) return;

  const lineIndex = ctx.index.segLineIndex[segIndex] ?? -1;
  const line = lineIndex >= 0 ? ctx.map.LINEDEFS[lineIndex] : undefined;

  const v1 = ctx.map.VERTEXES[seg.v1];
  const v2 = ctx.map.VERTEXES[seg.v2];
  if (!v1 || !v2) return;

  const startAngle = pointToPseudoAngle(ctx.viewX, ctx.viewY, v2.x, v2.y);
  const endAngle = pointToPseudoAngle(ctx.viewX, ctx.viewY, v1.x, v1.y);

  const record = (reason: SegVisibilityReason, clipsPortal = false) => {
    ctx.segByIndex.set(segIndex, {
      segIndex,
      lineIndex,
      subsectorIndex,
      reason,
      startAngle,
      endAngle,
      clipsPortal,
    });
  };

  if (!line) {
    record('no_linedef');
    return;
  }

  if (isSegFullyBehindViewer(ctx.viewX, ctx.viewY, v1, v2, ctx.viewYaw)) {
    record('backface');
    return;
  }

  // Cross-product backface test (replaces broken pseudo-angle span check).
  const cv1x = v1.x - ctx.viewX;
  const cv1y = v1.y - ctx.viewY;
  const cv2x = v2.x - ctx.viewX;
  const cv2y = v2.y - ctx.viewY;
  if (cv1x * cv2y - cv1y * cv2x >= 0) {
    record('backface');
    return;
  }

  if (!ctx.clipper.safeCheckRange(startAngle, endAngle)) {
    record('clip');
    return;
  }

  const sideIndex = line.sidenum[seg.side & 1];
  if (sideIndex < 0) {
    record('no_side');
    return;
  }

  const backSideIndex = line.sidenum[(seg.side & 1) ^ 1];
  const backSectorIndex =
    backSideIndex >= 0 ? ctx.map.SIDEDEFS[backSideIndex]?.sector ?? -1 : -1;

  let clipsPortal = false;
  if (backSectorIndex < 0) {
    ctx.clipper.safeAddClipRange(startAngle, endAngle);
    clipsPortal = true;
  } else if (backSectorIndex === frontSectorIndex) {
    const sideDef = ctx.map.SIDEDEFS[sideIndex];
    if (!textureValid(sideDef?.midTexture)) {
      if (!ctx.processedLines.has(lineIndex)) {
        ctx.processedLines.add(lineIndex);
      }
      record('validcount', clipsPortal);
      return;
    }
  } else {
    if (hwCheckClip(ctx.map, lineIndex, sideIndex, frontSectorIndex, backSectorIndex)) {
      ctx.clipper.safeAddClipRange(startAngle, endAngle);
      clipsPortal = true;
    }
    ctx.visibleSectors.add(backSectorIndex);
  }

  if (ctx.processedLines.has(lineIndex)) {
    record('validcount', clipsPortal);
    return;
  }

  // For two-sided asymmetric walls (one side textured, other '-'), prefer textured side.
  let submittedSideIndex = sideIndex;
  if (backSideIndex >= 0) {
    const thisSide = ctx.map.SIDEDEFS[sideIndex];
    const otherSide = ctx.map.SIDEDEFS[backSideIndex];
    const thisHasAnyTex =
      textureValid(thisSide?.topTexture) ||
      textureValid(thisSide?.midTexture) ||
      textureValid(thisSide?.bottomTexture);
    const otherHasAnyTex =
      textureValid(otherSide?.topTexture) ||
      textureValid(otherSide?.midTexture) ||
      textureValid(otherSide?.bottomTexture);
    if (!thisHasAnyTex && otherHasAnyTex) {
      submittedSideIndex = backSideIndex;
    }
  }

  ctx.processedLines.add(lineIndex);
  ctx.wallDrawOrder.push({ lineIndex, sideDefIndex: submittedSideIndex, segIndex });
  ctx.visibleLineIndices.add(lineIndex);
  ctx.visibleSectors.add(frontSectorIndex);
  record('visible', clipsPortal);
}

function summarizeTrace(
  map: WadMap,
  segByIndex: Map<number, SegTraceEntry>,
  wallDrawOrder: WallDrawEntry[],
  visitedSubsectors: Set<number>
): ClassicBspStats {
  const counts: Record<SegVisibilityReason, number> = {
    visible: 0,
    validcount: 0,
    backface: 0,
    clip: 0,
    no_linedef: 0,
    no_side: 0,
    not_reached: 0,
  };

  for (const entry of segByIndex.values()) {
    counts[entry.reason]++;
  }

  return {
    totalSegs: map.SEGS.length,
    visitedSubsectorCount: visitedSubsectors.size,
    visible: counts.visible,
    validcount: counts.validcount,
    backface: counts.backface,
    clip: counts.clip,
    noLinedef: counts.no_linedef,
    noSide: counts.no_side,
    notReached: counts.not_reached,
    wallDrawEntries: wallDrawOrder.length,
  };
}
