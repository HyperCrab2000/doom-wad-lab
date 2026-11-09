import type { WadMap } from '@/wad/interfaces/WadMap';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import {
  buildRejectVisibleSectors,
  getRejectTable,
  sectorsPotentiallyVisible,
} from '@/wad/renderer/utils/sectorRejectVisibility';
import {
  collectVisibleThingIndices,
  type StructuralViewSnapshot,
} from '@/wad/parity/structural/structuralViewSnapshot';

export interface StructuralViolation {
  rule: string;
  context: string;
  detail: string;
}

/**
 * Declarative structural rules (no pixels):
 * - camera sector ∈ BSP and draw sets
 * - draw ⊆ BSP (portal/REJECT may only remove)
 * - draw ⊆ REJECT (when REJECT present)
 * - every listed thing actually sits in a draw-visible sector
 * - thing list is complete for draw-visible sectors (single-player candidates)
 */
export function checkStructuralViewSnapshot(
  context: string,
  map: WadMap,
  index: BspRenderIndex,
  snapshot: StructuralViewSnapshot
): StructuralViolation[] {
  const violations: StructuralViolation[] = [];
  const bsp = new Set(snapshot.bspVisibleSectors);
  const draw = new Set(snapshot.drawVisibleSectors);

  if (snapshot.cameraSectorIndex >= 0 && !bsp.has(snapshot.cameraSectorIndex)) {
    violations.push({
      rule: 'camera-in-bsp',
      context,
      detail: `camera sector ${snapshot.cameraSectorIndex} missing from bspVisibleSectors`,
    });
  }
  if (snapshot.cameraSectorIndex >= 0 && !draw.has(snapshot.cameraSectorIndex)) {
    violations.push({
      rule: 'camera-in-draw',
      context,
      detail: `camera sector ${snapshot.cameraSectorIndex} missing from drawVisibleSectors`,
    });
  }

  for (const sectorIndex of snapshot.drawVisibleSectors) {
    if (!bsp.has(sectorIndex)) {
      violations.push({
        rule: 'draw-subset-bsp',
        context,
        detail: `draw sector ${sectorIndex} not BSP-visible`,
      });
    }
  }

  const reject = getRejectTable(map);
  if (reject && snapshot.cameraSectorIndex >= 0) {
    const rejectVisible = buildRejectVisibleSectors(map, snapshot.cameraSectorIndex);
    for (const sectorIndex of snapshot.drawVisibleSectors) {
      if (
        !sectorsPotentiallyVisible(
          reject,
          map.SECTORS.length,
          snapshot.cameraSectorIndex,
          sectorIndex
        )
      ) {
        violations.push({
          rule: 'draw-subset-reject',
          context,
          detail: `draw sector ${sectorIndex} REJECT-blocked from camera ${snapshot.cameraSectorIndex}`,
        });
      }
    }
    if (rejectVisible) {
      for (const sectorIndex of snapshot.drawVisibleSectors) {
        if (!rejectVisible.has(sectorIndex)) {
          violations.push({
            rule: 'draw-in-reject-set',
            context,
            detail: `draw sector ${sectorIndex} absent from REJECT PVS`,
          });
        }
      }
    }
  }

  if (snapshot.visibleThingIndices.length !== snapshot.visibleThingTypes.length) {
    violations.push({
      rule: 'thing-parallel-arrays',
      context,
      detail: `indices ${snapshot.visibleThingIndices.length} != types ${snapshot.visibleThingTypes.length}`,
    });
  }

  const expected = collectVisibleThingIndices(map, index, draw);
  if (
    expected.indices.length !== snapshot.visibleThingIndices.length ||
    expected.indices.some((id, i) => id !== snapshot.visibleThingIndices[i])
  ) {
    violations.push({
      rule: 'thing-set-complete',
      context,
      detail: `expected [${expected.indices.join(',')}] got [${snapshot.visibleThingIndices.join(',')}]`,
    });
  }

  for (let i = 0; i < snapshot.visibleThingIndices.length; i++) {
    const thingIndex = snapshot.visibleThingIndices[i]!;
    const thing = map.THINGS[thingIndex];
    if (!thing) {
      violations.push({
        rule: 'thing-index-valid',
        context,
        detail: `missing THINGS[${thingIndex}]`,
      });
      continue;
    }
    if (thing.type !== snapshot.visibleThingTypes[i]) {
      violations.push({
        rule: 'thing-type-match',
        context,
        detail: `THINGS[${thingIndex}] type ${thing.type} != listed ${snapshot.visibleThingTypes[i]}`,
      });
    }
  }

  return violations;
}

export function formatStructuralViolations(violations: StructuralViolation[], limit = 20): string {
  return violations
    .slice(0, limit)
    .map((v) => `[${v.rule}] ${v.context}: ${v.detail}`)
    .join('\n');
}
