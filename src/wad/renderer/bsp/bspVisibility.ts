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

function textureValid(name: string | undefined): boolean {
  return !!name && name !== '-';
}

/** One linedef submitted to `HWWall::Process` with the visible seg's sidedef. */
export interface WallDrawEntry {
  lineIndex: number;
  sideDefIndex: number;
  segIndex: number;
}

/** GZDoom `RenderBSP` output — draw lists in BSP traversal order. */
export interface BspVisibleSet {
  /** Subsectors whose flats are drawn (`DoSubsector` / `HWFlat::ProcessSector`). */
  flatSubsectorOrder: number[];
  /** Sectors whose flats are drawn (legacy sector meshes). */
  flatSectorOrder: number[];
  /** Linedefs + sidedefs submitted to `HWWall::Process`. */
  wallDrawOrder: WallDrawEntry[];
  visibleSectors: Set<number>;
  visibleSubsectors: Set<number>;
  visibleLineIndices: Set<number>;
  cameraSubsector: number;
  cameraSectorIndex: number;
}

/** @deprecated Use wallDrawOrder. */
export function wallLineOrderFromDrawOrder(order: readonly WallDrawEntry[]): number[] {
  return order.map((entry) => entry.lineIndex);
}

export interface BuildBspVisibleSetParams {
  map: WadMap;
  index: BspRenderIndex;
  viewX: number;
  viewY: number;
  viewYaw: number;
  frustumHalf?: number;
}

/**
 * GZDoom `RenderBSP` / `RenderBSPNode` / `DoSubsector` / `AddLine` / `HWWall::Process`.
 */
export function buildBspVisibleSet(params: BuildBspVisibleSetParams): BspVisibleSet {
  const { map, index, viewX, viewY, viewYaw, frustumHalf } = params;
  const clipper = new BspClipper();
  if (frustumHalf !== undefined) {
    clipper.seedFromViewYaw(viewYaw, frustumHalf);
  } else {
    clipper.seedFromViewYaw(viewYaw);
  }

  const visibleSectors = new Set<number>();
  const visibleSubsectors = new Set<number>();
  const visibleLineIndices = new Set<number>();
  const flatSectorOrder: number[] = [];
  const flatSubsectorOrder: number[] = [];
  const wallDrawOrder: WallDrawEntry[] = [];
  const drawnFlatSectors = new Set<number>();
  const drawnFlatSubsectors = new Set<number>();
  const processedLines = new Set<number>();

  const cameraSubsector = findCameraSubsector(map, viewX, viewY);
  const cameraSectorIndex =
    cameraSubsector >= 0 ? index.subsectorToSector[cameraSubsector] ?? -1 : -1;

  const nodes = map.NODES as Node[];
  const rootNode = nodes.length > 0 ? nodes.length - 1 : -1;

  const ctx: TraverseContext = {
    map,
    index,
    clipper,
    viewX,
    viewY,
    viewYaw,
    cameraSectorIndex,
    visibleSectors,
    visibleSubsectors,
    visibleLineIndices,
    flatSectorOrder,
    flatSubsectorOrder,
    wallDrawOrder,
    drawnFlatSectors,
    drawnFlatSubsectors,
    processedLines,
  };

  if (rootNode >= 0) {
    renderBspNode(ctx, rootNode);
  } else if (map.SSECTORS.length > 0) {
    doSubsector(ctx, 0);
  }

  return {
    flatSectorOrder,
    flatSubsectorOrder,
    wallDrawOrder,
    visibleSectors,
    visibleSubsectors,
    visibleLineIndices,
    cameraSubsector,
    cameraSectorIndex,
  };
}

interface TraverseContext {
  map: WadMap;
  index: BspRenderIndex;
  clipper: BspClipper;
  viewX: number;
  viewY: number;
  viewYaw: number;
  cameraSectorIndex: number;
  visibleSectors: Set<number>;
  visibleSubsectors: Set<number>;
  visibleLineIndices: Set<number>;
  flatSectorOrder: number[];
  flatSubsectorOrder: number[];
  wallDrawOrder: WallDrawEntry[];
  drawnFlatSectors: Set<number>;
  drawnFlatSubsectors: Set<number>;
  processedLines: Set<number>;
}

function renderBspNode(ctx: TraverseContext, nodeIndex: number): void {
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

function doSubsector(ctx: TraverseContext, subsectorIndex: number): void {
  const sectorIndex = ctx.index.subsectorToSector[subsectorIndex];
  if (sectorIndex < 0) return;

  ctx.visibleSubsectors.add(subsectorIndex);

  const segCount = ctx.index.subsectorSegs[subsectorIndex]?.length ?? 0;

  // GZDoom: AddLines before flat validcount.
  addLines(ctx, subsectorIndex, sectorIndex);

  if (!ctx.drawnFlatSubsectors.has(subsectorIndex) && segCount >= 3) {
    ctx.drawnFlatSubsectors.add(subsectorIndex);
    ctx.flatSubsectorOrder.push(subsectorIndex);
  }

  if (!ctx.drawnFlatSectors.has(sectorIndex)) {
    ctx.drawnFlatSectors.add(sectorIndex);
    ctx.flatSectorOrder.push(sectorIndex);
    ctx.visibleSectors.add(sectorIndex);
  }
}

function addLines(ctx: TraverseContext, subsectorIndex: number, frontSectorIndex: number): void {
  const segIndices = ctx.index.subsectorSegs[subsectorIndex] ?? [];
  for (const segIndex of segIndices) {
    addLine(ctx, segIndex, subsectorIndex, frontSectorIndex);
  }
}

function addLine(
  ctx: TraverseContext,
  segIndex: number,
  subsectorIndex: number,
  frontSectorIndex: number
): void {
  const seg = ctx.map.SEGS[segIndex];
  if (!seg) return;

  const lineIndex = ctx.index.segLineIndex[segIndex] ?? -1;
  const line = lineIndex >= 0 ? ctx.map.LINEDEFS[lineIndex] : undefined;
  if (!line) return;

  const v1 = ctx.map.VERTEXES[seg.v1];
  const v2 = ctx.map.VERTEXES[seg.v2];
  if (!v1 || !v2) return;

  if (isSegFullyBehindViewer(ctx.viewX, ctx.viewY, v1, v2, ctx.viewYaw)) {
    return;
  }

  // Step 1: Reject segs where both vertices are physically behind the camera.
  // Pseudo-angles near N/S are degenerate — both south and north map to ~0.5,
  // so south-wall endpoints appear inside the north frustum. This dot-product
  // test catches that before the angular clipper sees the seg.
  if (isSegFullyBehindViewer(ctx.viewX, ctx.viewY, v1, v2, ctx.viewYaw)) {
    return;
  }

  // Step 2: GZDoom cross-product backface test (replaces pseudo-angle span < 180°).
  // The span test collapsed for walls nearly parallel to the view (both endpoints
  // map to the same pseudo-angle), incorrectly rejecting front-facing walls.
  const v1x = v1.x - ctx.viewX;
  const v1y = v1.y - ctx.viewY;
  const v2x = v2.x - ctx.viewX;
  const v2y = v2.y - ctx.viewY;
  if (v1x * v2y - v1y * v2x >= 0) {
    return;
  }

  const startAngle = pointToPseudoAngle(ctx.viewX, ctx.viewY, v2.x, v2.y);
  const endAngle = pointToPseudoAngle(ctx.viewX, ctx.viewY, v1.x, v1.y);

  if (!ctx.clipper.safeCheckRange(startAngle, endAngle)) {
    return;
  }

  ctx.visibleSubsectors.add(subsectorIndex);

  const sideIndex = line.sidenum[seg.side & 1];
  if (sideIndex < 0) {
    return;
  }

  const backSideIndex = line.sidenum[(seg.side & 1) ^ 1];
  const backSectorIndex =
    backSideIndex >= 0 ? ctx.map.SIDEDEFS[backSideIndex]?.sector ?? -1 : -1;

  if (backSectorIndex < 0) {
    ctx.clipper.safeAddClipRange(startAngle, endAngle);
  } else if (backSectorIndex === frontSectorIndex) {
    const sideDef = ctx.map.SIDEDEFS[sideIndex];
    if (!textureValid(sideDef?.midTexture)) {
      if (!ctx.processedLines.has(lineIndex)) {
        ctx.processedLines.add(lineIndex);
      }
      return;
    }
  } else {
    if (hwCheckClip(ctx.map, lineIndex, sideIndex, frontSectorIndex, backSectorIndex)) {
      ctx.clipper.safeAddClipRange(startAngle, endAngle);
    }
    ctx.visibleSectors.add(backSectorIndex);
  }

  // GZDoom linedef->validcount: HWWall::Process once per line per frame (seg's sidedef).
  if (ctx.processedLines.has(lineIndex)) {
    return;
  }

  // For two-sided asymmetric walls (one side has texture, other doesn't), always
  // submit the side with geometry regardless of which side the BSP is currently on.
  // This prevents the untextured back-side from blocking the textured front-side.
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
}
