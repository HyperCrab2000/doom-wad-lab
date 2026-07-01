import type { WadMap } from '@/wad/interfaces/WadMap';
import {
  buildPortalVisibleSectors,
  sectorsSharePortalLine,
  type SectorVisibilityIndex,
} from '@/wad/renderer/utils/sectorVisibility';
import { isSkySector } from '@/wad/renderer/utils/sectorSkyVisibility';
import {
  buildRejectVisibleSectors,
  intersectVisibleSectorSets,
} from '@/wad/renderer/utils/sectorRejectVisibility';
import type { CourtyardIsland, CourtyardProbe } from '@/wad/renderer/courtyard/discoverCourtyards';
import type { GzdoomFlatDrawMode } from '@/wad/renderer/bsp/gzdoomDrawState';

export interface CourtyardVisibilitySnapshot {
  probe: CourtyardProbe;
  viewYaw: number;
  cameraSectorIndex: number;
  bspVisible: ReadonlySet<number>;
  /** Sectors with BSP-visited flat subsectors (`DoSubsector`). */
  bspFlatVisible: ReadonlySet<number>;
  portalVisible: ReadonlySet<number>;
  connectivityVisible: ReadonlySet<number>;
  drawVisible: ReadonlySet<number>;
  flatDrawMode: GzdoomFlatDrawMode;
}

export interface CourtyardInvariantViolation {
  rule: string;
  probe: string;
  yaw: number;
  detail: string;
}

/** GZDoom HW connectivity: portal flood-fill ∩ vanilla REJECT (mesh-renderer extension). */
export function buildConnectivityVisibleSectors(
  map: WadMap,
  index: SectorVisibilityIndex,
  viewX: number,
  viewY: number,
  cameraSectorIndex: number
): Set<number> {
  const portalVisible = buildPortalVisibleSectors(
    index,
    map,
    viewX,
    viewY,
    cameraSectorIndex
  );
  const rejectVisible = buildRejectVisibleSectors(map, cameraSectorIndex);
  return (
    intersectVisibleSectorSets(portalVisible, rejectVisible, cameraSectorIndex) ??
    portalVisible
  );
}

function skySectorsAdjacentTo(
  map: WadMap,
  index: SectorVisibilityIndex,
  island: CourtyardIsland,
  sectorIndex: number
): number[] {
  return (index.sectorAdjacency[sectorIndex] ?? []).filter(
    (neighbor) =>
      isSkySector(map, neighbor) && island.skySectors.includes(neighbor)
  );
}

function isCourtyardWindowRoom(
  map: WadMap,
  index: SectorVisibilityIndex,
  island: CourtyardIsland,
  sectorIndex: number
): boolean {
  if (island.windowRooms.includes(sectorIndex)) return true;

  for (const windowRoom of island.windowRooms) {
    if (!sectorsSharePortalLine(map, windowRoom, sectorIndex)) continue;
    if (skySectorsAdjacentTo(map, index, island, windowRoom).length > 0) {
      return true;
    }
  }
  return false;
}

/** True when A and B are indoor rooms on the same courtyard sky edge (E1M1 43↔41). */
export function areCourtyardWindowPair(
  map: WadMap,
  index: SectorVisibilityIndex,
  island: CourtyardIsland,
  sectorA: number,
  sectorB: number
): boolean {
  if (sectorA === sectorB) return false;
  if (!sectorsSharePortalLine(map, sectorA, sectorB)) return false;
  return (
    isCourtyardWindowRoom(map, index, island, sectorA) &&
    isCourtyardWindowRoom(map, index, island, sectorB)
  );
}

function skyIslandsInSet(
  map: WadMap,
  skyIslandIds: Int32Array,
  sectors: Iterable<number>
): Set<number> {
  const islands = new Set<number>();
  for (const sectorIndex of sectors) {
    if (!isSkySector(map, sectorIndex)) continue;
    const islandId = skyIslandIds[sectorIndex];
    if (islandId >= 0) islands.add(islandId);
  }
  return islands;
}

/** Skip strict island rules when a room opens onto two outdoor cells (map corner windows). */
export function hasSingleCourtyardOpening(
  map: WadMap,
  index: SectorVisibilityIndex,
  skyIslandIds: Int32Array,
  cameraSectorIndex: number
): boolean {
  if (cameraSectorIndex < 0) return false;
  if (isSkySector(map, cameraSectorIndex)) return true;

  const adjacentSkies = (index.sectorAdjacency[cameraSectorIndex] ?? []).filter((neighbor) =>
    isSkySector(map, neighbor)
  );
  const islands = new Set(
    adjacentSkies.map((sky) => skyIslandIds[sky]).filter((islandId) => islandId >= 0)
  );
  return islands.size <= 1;
}

export function shouldApplyCourtyardConnectivityRules(
  map: WadMap,
  index: SectorVisibilityIndex,
  skyIslandIds: Int32Array,
  probe: CourtyardProbe,
  cameraSectorIndex: number
): boolean {
  if (!hasSingleCourtyardOpening(map, index, skyIslandIds, cameraSectorIndex)) {
    return false;
  }
  if (
    isSkySector(map, cameraSectorIndex) &&
    !isSkySector(map, probe.cameraSector) &&
    cameraSectorIndex !== probe.cameraSector
  ) {
    return false;
  }
  return true;
}

/**
 * GZDoom / vanilla topology rules (map graph + REJECT, independent of yaw):
 *
 * - All sky sectors in the portal set belong to one outdoor island.
 * - REJECT is applied via `buildConnectivityVisibleSectors`.
 */
export function checkConnectivityInvariants(
  map: WadMap,
  index: SectorVisibilityIndex,
  skyIslandIds: Int32Array,
  island: CourtyardIsland,
  probe: CourtyardProbe,
  viewYaw: number,
  cameraSectorIndex: number,
  portalVisible: ReadonlySet<number>,
  connectivityVisible: ReadonlySet<number>
): CourtyardInvariantViolation[] {
  const violations: CourtyardInvariantViolation[] = [];
  const ctx = `${probe.label} cam=${cameraSectorIndex} yaw=${((viewYaw * 180) / Math.PI).toFixed(0)}°`;

  if (!connectivityVisible.has(cameraSectorIndex)) {
    violations.push({
      rule: 'connectivity-includes-camera',
      probe: probe.label,
      yaw: viewYaw,
      detail: `${ctx}: camera sector missing from connectivity set`,
    });
  }

  const portalSkyIslands = skyIslandsInSet(map, skyIslandIds, portalVisible);
  if (portalSkyIslands.size > 1) {
    violations.push({
      rule: 'portal-single-sky-island',
      probe: probe.label,
      yaw: viewYaw,
      detail: `${ctx}: portal spans sky islands ${[...portalSkyIslands].join(',')}`,
    });
  }

  if (isSkySector(map, cameraSectorIndex)) {
    const cameraIsland = skyIslandIds[cameraSectorIndex];
    for (const sectorIndex of portalVisible) {
      if (!isSkySector(map, sectorIndex)) continue;
      if (skyIslandIds[sectorIndex] !== cameraIsland) {
        violations.push({
          rule: 'outdoor-camera-single-island',
          probe: probe.label,
          yaw: viewYaw,
          detail: `${ctx}: outdoor camera island ${cameraIsland} but portal has sky ${sectorIndex} from island ${skyIslandIds[sectorIndex]}`,
        });
      }
    }
  }

  if (isCourtyardWindowRoom(map, index, island, cameraSectorIndex)) {
    for (let sectorIndex = 0; sectorIndex < map.SECTORS.length; sectorIndex++) {
      if (sectorIndex === cameraSectorIndex) continue;
      if (!areCourtyardWindowPair(map, index, island, cameraSectorIndex, sectorIndex)) {
        continue;
      }
      if (!portalVisible.has(sectorIndex)) {
        violations.push({
          rule: 'courtyard-window-pair-portal',
          probe: probe.label,
          yaw: viewYaw,
          detail: `${ctx}: courtyard window ${cameraSectorIndex} missing opposite ${sectorIndex} in portal`,
        });
      }
    }
  }

  return violations;
}

/**
 * Production draw set must match GZDoom BSP flat visits (subsector mode)
 * or stay inside BSP × connectivity (legacy sector mesh mode).
 */
export function checkDrawInvariants(
  probe: CourtyardProbe,
  viewYaw: number,
  cameraSectorIndex: number,
  bspFlatVisible: ReadonlySet<number>,
  connectivityVisible: ReadonlySet<number>,
  drawVisible: ReadonlySet<number>,
  flatDrawMode: GzdoomFlatDrawMode
): CourtyardInvariantViolation[] {
  const violations: CourtyardInvariantViolation[] = [];
  const ctx = `${probe.label} cam=${cameraSectorIndex} yaw=${((viewYaw * 180) / Math.PI).toFixed(0)}°`;

  if (!drawVisible.has(cameraSectorIndex)) {
    violations.push({
      rule: 'draw-includes-camera',
      probe: probe.label,
      yaw: viewYaw,
      detail: `${ctx}: camera sector missing from draw set`,
    });
  }

  if (flatDrawMode === 'subsector-bsp') {
    for (const sectorIndex of drawVisible) {
      if (!bspFlatVisible.has(sectorIndex)) {
        violations.push({
          rule: 'draw-subset-bsp-flats',
          probe: probe.label,
          yaw: viewYaw,
          detail: `${ctx}: sector ${sectorIndex} in draw but no BSP-visited flat subsector`,
        });
      }
    }
    return violations;
  }

  for (const sectorIndex of drawVisible) {
    if (!connectivityVisible.has(sectorIndex)) {
      violations.push({
        rule: 'draw-subset-connectivity',
        probe: probe.label,
        yaw: viewYaw,
        detail: `${ctx}: sector ${sectorIndex} in draw but not connectivity-visible`,
      });
    }
  }

  return violations;
}

/** Connectivity must never admit foreign outdoor islands (stricter than BSP pass walls). */
export function checkConnectivitySkyIsolation(
  map: WadMap,
  skyIslandIds: Int32Array,
  probe: CourtyardProbe,
  viewYaw: number,
  cameraSectorIndex: number,
  connectivityVisible: ReadonlySet<number>
): CourtyardInvariantViolation[] {
  const violations: CourtyardInvariantViolation[] = [];
  const ctx = `${probe.label} cam=${cameraSectorIndex} yaw=${((viewYaw * 180) / Math.PI).toFixed(0)}°`;

  const connectivitySkyIslands = skyIslandsInSet(map, skyIslandIds, connectivityVisible);
  if (connectivitySkyIslands.size > 1) {
    violations.push({
      rule: 'connectivity-single-sky-island',
      probe: probe.label,
      yaw: viewYaw,
      detail: `${ctx}: connectivity spans sky islands ${[...connectivitySkyIslands].join(',')}`,
    });
  }

  if (isSkySector(map, cameraSectorIndex)) {
    const cameraIsland = skyIslandIds[cameraSectorIndex];
    for (const sectorIndex of connectivityVisible) {
      if (!isSkySector(map, sectorIndex)) continue;
      if (skyIslandIds[sectorIndex] !== cameraIsland) {
        violations.push({
          rule: 'connectivity-outdoor-camera-island',
          probe: probe.label,
          yaw: viewYaw,
          detail: `${ctx}: outdoor camera island ${cameraIsland} but connectivity has sky ${sectorIndex} from island ${skyIslandIds[sectorIndex]}`,
        });
      }
    }
  }

  return violations;
}

export function checkCourtyardSnapshot(
  map: WadMap,
  index: SectorVisibilityIndex,
  skyIslandIds: Int32Array,
  island: CourtyardIsland,
  snapshot: CourtyardVisibilitySnapshot,
  options: { connectivityRules?: boolean } = {}
): CourtyardInvariantViolation[] {
  const connectivityRules =
    options.connectivityRules ??
    shouldApplyCourtyardConnectivityRules(
      map,
      index,
      skyIslandIds,
      snapshot.probe,
      snapshot.cameraSectorIndex
    );

  const violations = checkDrawInvariants(
    snapshot.probe,
    snapshot.viewYaw,
    snapshot.cameraSectorIndex,
    snapshot.bspFlatVisible,
    snapshot.connectivityVisible,
    snapshot.drawVisible,
    snapshot.flatDrawMode
  );

  if (!connectivityRules) {
    return violations;
  }

  return [
    ...checkConnectivityInvariants(
      map,
      index,
      skyIslandIds,
      island,
      snapshot.probe,
      snapshot.viewYaw,
      snapshot.cameraSectorIndex,
      snapshot.portalVisible,
      snapshot.connectivityVisible
    ),
    ...checkConnectivitySkyIsolation(
      map,
      skyIslandIds,
      snapshot.probe,
      snapshot.viewYaw,
      snapshot.cameraSectorIndex,
      snapshot.connectivityVisible
    ),
    ...violations,
  ];
}
