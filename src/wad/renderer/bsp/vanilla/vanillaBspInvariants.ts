import type { BspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';
import type { ClassicBspTrace } from '@/wad/renderer/bsp/classicBspTrace';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import type { WadMap } from '@/wad/interfaces/WadMap';
import { sectorsFromFlatSubsectorOrder } from '@/wad/renderer/bsp/gzdoomDrawState';

export interface VanillaBspViolation {
  rule: string;
  context: string;
  detail: string;
}

/**
 * Reference = `buildBspVisibleSet` / `traceClassicBsp`, ported from id `r_bsp.c`
 * (angular clipper, DoSubsector, AddLine) via GZDoom hw_bsp lineage.
 */
export function checkTraceMatchesVisibleSet(
  context: string,
  visible: BspVisibleSet,
  trace: ClassicBspTrace
): VanillaBspViolation[] {
  const violations: VanillaBspViolation[] = [];

  if (trace.cameraSubsector !== visible.cameraSubsector) {
    violations.push({
      rule: 'trace-camera-subsector',
      context,
      detail: `trace ${trace.cameraSubsector} != visible ${visible.cameraSubsector}`,
    });
  }
  if (trace.cameraSectorIndex !== visible.cameraSectorIndex) {
    violations.push({
      rule: 'trace-camera-sector',
      context,
      detail: `trace ${trace.cameraSectorIndex} != visible ${visible.cameraSectorIndex}`,
    });
  }
  if (trace.wallDrawOrder.length !== visible.wallDrawOrder.length) {
    violations.push({
      rule: 'trace-wall-count',
      context,
      detail: `trace ${trace.wallDrawOrder.length} walls != visible ${visible.wallDrawOrder.length}`,
    });
  } else {
    for (let i = 0; i < visible.wallDrawOrder.length; i++) {
      const a = visible.wallDrawOrder[i]!;
      const b = trace.wallDrawOrder[i]!;
      if (a.lineIndex !== b.lineIndex || a.sideDefIndex !== b.sideDefIndex) {
        violations.push({
          rule: 'trace-wall-order',
          context,
          detail: `wall ${i}: visible L${a.lineIndex}/S${a.sideDefIndex} != trace L${b.lineIndex}/S${b.sideDefIndex}`,
        });
        break;
      }
    }
  }

  return violations;
}

export function checkVanillaBspStructure(
  context: string,
  map: WadMap,
  index: BspRenderIndex,
  visible: BspVisibleSet
): VanillaBspViolation[] {
  const violations: VanillaBspViolation[] = [];

  if (visible.cameraSectorIndex >= 0 && !visible.visibleSectors.has(visible.cameraSectorIndex)) {
    violations.push({
      rule: 'bsp-camera-sector-visible',
      context,
      detail: `camera sector ${visible.cameraSectorIndex} not in visibleSectors`,
    });
  }

  for (const subsectorIndex of visible.flatSubsectorOrder) {
    const segs = index.subsectorSegs[subsectorIndex];
    if (!segs || segs.length < 3) {
      violations.push({
        rule: 'bsp-flat-subsector-segs',
        context,
        detail: `flat subsector ${subsectorIndex} has ${segs?.length ?? 0} segs`,
      });
    }
    const sectorIndex = index.subsectorToSector[subsectorIndex] ?? -1;
    if (sectorIndex < 0 || !visible.visibleSectors.has(sectorIndex)) {
      violations.push({
        rule: 'bsp-flat-sector-visible',
        context,
        detail: `flat subsector ${subsectorIndex} sector ${sectorIndex} not marked visible`,
      });
    }
  }

  for (const entry of visible.wallDrawOrder) {
    const line = map.LINEDEFS[entry.lineIndex];
    const side = map.SIDEDEFS[entry.sideDefIndex];
    if (!line || !side) {
      violations.push({
        rule: 'bsp-wall-dangling',
        context,
        detail: `wall entry L${entry.lineIndex}/S${entry.sideDefIndex} invalid`,
      });
      continue;
    }
    if (!visible.visibleLineIndices.has(entry.lineIndex)) {
      violations.push({
        rule: 'bsp-wall-line-visible',
        context,
        detail: `wall L${entry.lineIndex} missing from visibleLineIndices`,
      });
    }
  }

  return violations;
}

/** Mesh draw lists must stay inside vanilla BSP; portal/REJECT may only remove. */
export function checkDrawStateVsVanillaBsp(
  context: string,
  visible: BspVisibleSet,
  drawState: GzdoomDrawState
): VanillaBspViolation[] {
  const violations: VanillaBspViolation[] = [];

  for (const sectorIndex of drawState.visibleSectors) {
    if (!visible.visibleSectors.has(sectorIndex)) {
      violations.push({
        rule: 'draw-sector-subset-bsp',
        context,
        detail: `draw sector ${sectorIndex} not BSP-visible`,
      });
    }
  }

  for (const subsectorIndex of drawState.flatSubsectorOrder) {
    if (!visible.flatSubsectorOrder.includes(subsectorIndex)) {
      if (subsectorIndex === drawState.cameraSubsector) continue;
      violations.push({
        rule: 'draw-flat-subset-bsp',
        context,
        detail: `draw flat subsector ${subsectorIndex} not in BSP flatSubsectorOrder`,
      });
    }
  }

  if (
    drawState.cameraSubsector >= 0 &&
    !drawState.flatSubsectorOrder.includes(drawState.cameraSubsector)
  ) {
    violations.push({
      rule: 'draw-includes-camera-subsector',
      context,
      detail: `camera subsector ${drawState.cameraSubsector} missing from flatSubsectorOrder`,
    });
  }

  return violations;
}

/** Debug wireframe must use full BSP lists — never fewer flats/walls than portal-filtered draw. */
export function checkWireframeUsesVanillaBsp(
  context: string,
  drawState: GzdoomDrawState
): VanillaBspViolation[] {
  const violations: VanillaBspViolation[] = [];

  if (drawState.bspFlatSubsectorOrder.length < drawState.portalFlatSubsectorOrder.length) {
    violations.push({
      rule: 'wireframe-bsp-flats',
      context,
      detail: `bsp flats ${drawState.bspFlatSubsectorOrder.length} < portal flats ${drawState.portalFlatSubsectorOrder.length}`,
    });
  }

  for (const subsectorIndex of drawState.portalFlatSubsectorOrder) {
    if (!drawState.bspFlatSubsectorOrder.includes(subsectorIndex)) {
      if (subsectorIndex === drawState.cameraSubsector) continue;
      violations.push({
        rule: 'wireframe-bsp-covers-portal-flat',
        context,
        detail: `portal flat subsector ${subsectorIndex} missing from bspFlatSubsectorOrder`,
      });
    }
  }

  if (drawState.bspWallDrawOrder.length < drawState.portalWallDrawOrder.length) {
    violations.push({
      rule: 'wireframe-bsp-walls',
      context,
      detail: `bsp walls ${drawState.bspWallDrawOrder.length} < portal walls ${drawState.portalWallDrawOrder.length}`,
    });
  }

  return violations;
}

/** Production path: flat draw sectors must come from BSP DoSubsector visits only. */
export function checkGzdoomSubsectorFlatDraw(
  context: string,
  index: BspRenderIndex,
  visible: BspVisibleSet,
  drawState: GzdoomDrawState
): VanillaBspViolation[] {
  const violations: VanillaBspViolation[] = [];

  if (drawState.flatDrawMode !== 'subsector-bsp') {
    return violations;
  }

  const bspFlatSectors = sectorsFromFlatSubsectorOrder(index, visible.flatSubsectorOrder);
  if (drawState.cameraSectorIndex >= 0) {
    bspFlatSectors.add(drawState.cameraSectorIndex);
  }

  for (const sectorIndex of drawState.visibleSectors) {
    if (!bspFlatSectors.has(sectorIndex)) {
      violations.push({
        rule: 'gzdoom-flat-sector-from-subsector',
        context,
        detail: `draw flat sector ${sectorIndex} has no BSP-visited subsector`,
      });
    }
  }

  for (const subsectorIndex of drawState.flatSubsectorOrder) {
    if (!visible.flatSubsectorOrder.includes(subsectorIndex)) {
      if (subsectorIndex === drawState.cameraSubsector) continue;
      violations.push({
        rule: 'gzdoom-flat-subsector-bsp',
        context,
        detail: `draw flat subsector ${subsectorIndex} not in BSP flatSubsectorOrder`,
      });
    }
  }

  return violations;
}

export function countPortalFilteredSubsectors(
  visible: BspVisibleSet,
  drawState: GzdoomDrawState
): number {
  const drawSet = new Set(drawState.portalFlatSubsectorOrder);
  let removed = 0;
  for (const subsectorIndex of visible.flatSubsectorOrder) {
    if (!drawSet.has(subsectorIndex)) removed++;
  }
  return removed;
}
