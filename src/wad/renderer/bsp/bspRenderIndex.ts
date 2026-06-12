import type { Node } from '@/wad/interfaces/Node';
import type { WadMap } from '@/wad/interfaces/WadMap';

export const SUBSECTOR_FLAG = 0x8000;
const SUBSECTOR_INDEX_MASK = 0x7fff;

/** Doom BSP child refs are uint16; parser stores them as int16. */
export function normalizeBspChild(child: number): number {
  return child & 0xffff;
}

export function childIsSubsector(child: number): boolean {
  return (normalizeBspChild(child) & SUBSECTOR_FLAG) !== 0;
}

export function childSubsectorIndex(child: number): number {
  return normalizeBspChild(child) & SUBSECTOR_INDEX_MASK;
}

export interface BspRenderIndex {
  subsectorToSector: number[];
  /** Seg indices belonging to each subsector (full list, not firstseg only). */
  subsectorSegs: number[][];
  segLineIndex: number[];
  segSideIndex: number[];
  /** Front sector index per seg (from sidedef). */
  segFrontSector: number[];
  nodeCount: number;
}

export function buildBspRenderIndex(map: WadMap): BspRenderIndex | null {
  const nodes = map.NODES as Node[] | undefined;
  const ssectors = map.SSECTORS;
  const segs = map.SEGS;
  if (!nodes?.length || !ssectors?.length || !segs?.length) {
    return null;
  }

  const subsectorToSector = new Array<number>(ssectors.length);
  const subsectorSegs: number[][] = ssectors.map(() => []);
  const segLineIndex = segs.map((seg) => seg.linedef);
  const segSideIndex = segs.map((seg) => seg.side);
  const segFrontSector = segs.map((seg) => {
    const line = map.LINEDEFS[seg.linedef];
    if (!line) return -1;
    const sideNum = line.sidenum[seg.side & 1];
    if (sideNum < 0) return -1;
    return map.SIDEDEFS[sideNum].sector;
  });

  for (let subIndex = 0; subIndex < ssectors.length; subIndex++) {
    const sub = ssectors[subIndex];
    for (let i = 0; i < sub.numsegs; i++) {
      const segIndex = sub.firstseg + i;
      subsectorSegs[subIndex]!.push(segIndex);
    }
    const firstSeg = segs[sub.firstseg];
    if (!firstSeg) {
      subsectorToSector[subIndex] = -1;
      continue;
    }
    subsectorToSector[subIndex] = segFrontSector[sub.firstseg] ?? -1;
  }

  return {
    subsectorToSector,
    subsectorSegs,
    segLineIndex,
    segSideIndex,
    segFrontSector,
    nodeCount: nodes.length,
  };
}

/** Vanilla `R_PointOnSide` (chocolate-doom / id BSP). */
export function pointOnSide(x: number, y: number, node: Node): number {
  if (node.dx === 0) {
    if (x <= node.x) {
      return node.dy > 0 ? 1 : 0;
    }
    return node.dy < 0 ? 1 : 0;
  }

  if (node.dy === 0) {
    if (y <= node.y) {
      return node.dx < 0 ? 1 : 0;
    }
    return node.dx > 0 ? 1 : 0;
  }

  const dx = x - node.x;
  const dy = y - node.y;
  const left = node.dy * dx;
  const right = dy * node.dx;
  return right < left ? 0 : 1;
}

/**
 * Pick the linedef sidedef whose textures face the viewer.
 * BSP only records the first seg that hits a line (order varies with view); this is stable.
 */
export function resolveLinedefSideForView(
  map: WadMap,
  lineIndex: number,
  viewX: number,
  viewY: number,
  cameraSectorIndex: number,
  visibleSectors: ReadonlySet<number> | null | undefined,
  bspSideDefIndex: number
): number {
  const line = map.LINEDEFS[lineIndex];
  if (!line || line.sidenum[0] < 0) return bspSideDefIndex;
  if (line.sidenum[1] < 0) return line.sidenum[0];

  const side0 = line.sidenum[0];
  const side1 = line.sidenum[1];
  const sector0 = map.SIDEDEFS[side0]?.sector ?? -1;
  const sector1 = map.SIDEDEFS[side1]?.sector ?? -1;

  if (cameraSectorIndex >= 0) {
    if (cameraSectorIndex === sector0) return side0;
    if (cameraSectorIndex === sector1) return side1;
  }

  if (visibleSectors) {
    const vis0 = visibleSectors.has(sector0);
    const vis1 = visibleSectors.has(sector1);
    if (vis0 && !vis1) return side0;
    if (vis1 && !vis0) return side1;
  }

  const v1 = map.VERTEXES[line.v1];
  const v2 = map.VERTEXES[line.v2];
  if (!v1 || !v2) return bspSideDefIndex;

  const mx = (v1.x + v2.x) * 0.5;
  const my = (v1.y + v2.y) * 0.5;
  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const dot = -dy * (viewX - mx) + dx * (viewY - my);
  return dot >= 0 ? side1 : side0;
}

/** Both endpoints behind view yaw in Doom XY — pseudo-angle backface cannot tell north from south. */
export function isSegFullyBehindViewer(
  viewX: number,
  viewY: number,
  v1: { x: number; y: number },
  v2: { x: number; y: number },
  viewYawRadians: number
): boolean {
  const forwardX = Math.cos(viewYawRadians);
  const forwardY = Math.sin(viewYawRadians);
  const d1 = (v1.x - viewX) * forwardX + (v1.y - viewY) * forwardY;
  const d2 = (v2.x - viewX) * forwardX + (v2.y - viewY) * forwardY;
  return d1 < -1e-6 && d2 < -1e-6;
}

export function findCameraSubsector(map: WadMap, x: number, y: number): number {
  const nodes = map.NODES as Node[] | undefined;
  if (!nodes?.length) return -1;
  return walkSubsector(nodes, x, y, normalizeBspChild(nodes.length - 1));
}

function walkSubsector(nodes: Node[], x: number, y: number, nodeIndex: number): number {
  if (childIsSubsector(nodeIndex)) {
    return childSubsectorIndex(nodeIndex);
  }
  const node = nodes[nodeIndex]!;
  const side = pointOnSide(x, y, node);
  return walkSubsector(nodes, x, y, normalizeBspChild(node.children[side]));
}
