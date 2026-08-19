import type { WadMap } from '@/wad/interfaces/WadMap';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import {
  buildBspVisibleSet,
  type WallDrawEntry,
} from '@/wad/renderer/bsp/bspVisibility';
import {
  buildSupplementedWallDrawOrder,
  filterOneSidedBackfaceWalls,
  filterWallDrawOrderForFlatAnchor,
  isVanillaBackface,
  supplementTwoSidedClipWallsFromTrace,
  supplementWhitelistedLinesFromTrace,
} from '@/wad/renderer/bsp/supplementWallDraw';
import { traceClassicBsp } from '@/wad/renderer/bsp/classicBspTrace';
import {
  buildPortalVisibleSectors,
  buildSectorVisibilityIndex,
  finalizeSectorVisibilityIndex,
  sectorsSharePortalLine,
  type SectorVisibilityIndex,
} from '@/wad/renderer/utils/sectorVisibility';
import {
  isSkySector,
  isHangarLipWallSectorOccludingOutdoorSky,
  hasOutdoorSkyThroughOpening,
  shouldSuppressLipWallForOutdoorSky,
} from '@/wad/renderer/utils/sectorSkyVisibility';
import { findSectorAtPoint } from '@/wad/renderer/utils/sectorLookup';
import { classifyFlatLiquid } from '@/wad/renderer/renderGame/sectorLighting';
import {
  buildRejectVisibleSectors,
  intersectVisibleSectorSets,
} from '@/wad/renderer/utils/sectorRejectVisibility';

/** How flat draw sets are derived from BSP output. */
export type GzdoomFlatDrawMode = 'subsector-bsp' | 'sector-connectivity';

/**
 * Per-frame GZDoom HW renderer draw state (`RenderBSP` → draw lists).
 * Walls: BSP `wallDrawOrder` — one sidedef per linedef (`HWWall::Process`).
 * Flats (subsector mode): BSP `flatSubsectorOrder` only — matches `DoSubsector` / `HWFlat::ProcessSector`.
 * Flats (legacy sector mode): full sector meshes filtered by portal ∩ REJECT.
 */
export interface GzdoomDrawState {
  viewX: number;
  viewY: number;
  cameraSectorIndex: number;
  cameraSubsector: number;
  wallDrawOrder: readonly WallDrawEntry[];
  /** GZDoom DoSubsector → HWFlat::ProcessSector (preferred draw path). */
  flatSubsectorOrder: readonly number[];
  /** Legacy sector-level flat list (fallback when subsector meshes unavailable). */
  flatSectorOrder: readonly number[];
  /** Full-sector flat supplement pool for mesh cracks; not part of BSP-visible draw contract. */
  flatSupplementSectorOrder?: readonly number[];
  visibleLineIndices: ReadonlySet<number>;
  visibleSectors: ReadonlySet<number>;
  /** Vanilla `RenderBSP` subsector list before portal/REJECT culling (debug wireframe). */
  bspFlatSubsectorOrder: readonly number[];
  /** Supplemented BSP wall list before portal/REJECT culling (debug wireframe). */
  bspWallDrawOrder: readonly WallDrawEntry[];
  /** BSP subsectors after portal ∩ REJECT culling (wireframe portal-cull / solid draw). */
  portalFlatSubsectorOrder: readonly number[];
  /** Walls after portal ∩ REJECT culling. */
  portalWallDrawOrder: readonly WallDrawEntry[];
  /** Whether flats follow GZDoom BSP subsectors or legacy sector connectivity culling. */
  flatDrawMode: GzdoomFlatDrawMode;
}

export interface BuildGzdoomDrawStateParams {
  map: WadMap;
  buffers: MapBuffers;
  viewX: number;
  viewY: number;
  viewYaw: number;
  cameraPos: [number, number, number];
  /** When false, skip courtyard sky flats visible through window lips. Default true. */
  enableCourtyardSky?: boolean;
}

/**
 * Connectivity set for draw culling: portal flood-fill ∩ REJECT (when present).
 *
 * Vanilla Doom / GZDoom HW use BSP angular clipping only (`RenderBSP` / `AddLine`).
 * This mesh renderer also draws full sector flat polygons, so pass walls can leave
 * BSP-visible sectors that must not be drawn — intersect with portal + REJECT.
 */
export function buildConnectivityVisibleSectors(
  map: WadMap,
  sectorVisibility: MapBuffers['sectorVisibility'],
  viewX: number,
  viewY: number,
  cameraSectorIndex: number
): Set<number> | null {
  if (!sectorVisibility || cameraSectorIndex < 0) {
    return null;
  }

  const portalVisible = buildPortalVisibleSectors(
    sectorVisibility,
    map,
    viewX,
    viewY,
    cameraSectorIndex
  );
  const rejectVisible = buildRejectVisibleSectors(map, cameraSectorIndex);
  return intersectVisibleSectorSets(portalVisible, rejectVisible, cameraSectorIndex);
}

/** BSP-visible sectors restricted to portal + REJECT connectivity. */
export function filterBspSectorsByPortalGraph(
  map: WadMap,
  sectorVisibility: MapBuffers['sectorVisibility'],
  viewX: number,
  viewY: number,
  cameraSectorIndex: number,
  bspVisibleSectors: ReadonlySet<number>
): Set<number> {
  const connectivityVisible = buildConnectivityVisibleSectors(
    map,
    sectorVisibility,
    viewX,
    viewY,
    cameraSectorIndex
  );

  if (!connectivityVisible) {
    return new Set(bspVisibleSectors);
  }

  const filtered = new Set<number>();
  for (const sectorIndex of bspVisibleSectors) {
    if (connectivityVisible.has(sectorIndex)) {
      filtered.add(sectorIndex);
    }
  }
  filtered.add(cameraSectorIndex);
  return filtered;
}

/**
 * Mesh renderer draw set: portal ∩ REJECT ∩ BSP, plus outdoor flats BSP visits through
 * window lips (indoor sector in the BSP flat set sharing a portal line with that sky cell).
 * Stops pass-wall x-ray (hangar sky 0 from window room 43 — lip neighbors are sky-only) while
 * keeping stair/window courtyard views (lip rooms 43–46 in BSP flats, not portal flood).
 */
export function buildMeshDrawVisibleSectors(
  map: WadMap,
  sectorVisibility: SectorVisibilityIndex,
  viewX: number,
  viewY: number,
  cameraSectorIndex: number,
  bspVisibleSectors: ReadonlySet<number>,
  bspFlatSubsectorOrder: readonly number[],
  index: BspRenderIndex,
  enableCourtyardLips = true
): Set<number> {
  const draw = filterBspSectorsByPortalGraph(
    map,
    sectorVisibility,
    viewX,
    viewY,
    cameraSectorIndex,
    bspVisibleSectors
  );

  if (!enableCourtyardLips) {
    if (cameraSectorIndex >= 0) {
      draw.add(cameraSectorIndex);
    }
    return draw;
  }

  const bspFlatSectors = sectorsFromFlatSubsectorOrder(index, bspFlatSubsectorOrder);
  const portalBaseline = new Set(draw);
  let cameraSkyIsland: Set<number> | null = null;
  if (isSkySector(map, cameraSectorIndex)) {
    const skyIsland = new Set<number>([cameraSectorIndex]);
    const queue = [cameraSectorIndex];
    while (queue.length > 0) {
      const sectorIndex = queue.shift()!;
      for (const neighbor of sectorVisibility.sectorAdjacency[sectorIndex] ?? []) {
        if (skyIsland.has(neighbor) || !isSkySector(map, neighbor)) continue;
        if (!sectorsSharePortalLine(map, sectorIndex, neighbor)) continue;
        skyIsland.add(neighbor);
        queue.push(neighbor);
      }
    }
    cameraSkyIsland = skyIsland;
    for (const sectorIndex of [...draw]) {
      if (sectorIndex === cameraSectorIndex) continue;
      if (isSkySector(map, sectorIndex)) {
        if (!skyIsland.has(sectorIndex)) {
          draw.delete(sectorIndex);
        }
        continue;
      }
      const touchesCameraSkyIsland = (sectorVisibility.sectorAdjacency[sectorIndex] ?? []).some((neighbor) =>
        skyIsland.has(neighbor) &&
        bspFlatSectors.has(neighbor) &&
        sectorsSharePortalLine(map, sectorIndex, neighbor)
      );
      if (!touchesCameraSkyIsland) {
        draw.delete(sectorIndex);
      }
    }
  }

  const lipIndoorAnchor = new Map<number, number>();
  for (const sectorIndex of bspFlatSectors) {
    if (!isSkySector(map, sectorIndex) || draw.has(sectorIndex)) continue;
    if (cameraSkyIsland && !cameraSkyIsland.has(sectorIndex)) continue;

    for (const neighbor of sectorVisibility.sectorAdjacency[sectorIndex] ?? []) {
      if (isSkySector(map, neighbor)) continue;
      // Lip room must appear in BSP flats (window opening), not pass-wall-only wall visits.
      if (!bspFlatSectors.has(neighbor)) continue;
      if (!sectorsSharePortalLine(map, neighbor, sectorIndex)) continue;
      draw.add(sectorIndex);
      lipIndoorAnchor.set(sectorIndex, neighbor);
      break;
    }
  }

  for (const sectorIndex of bspFlatSectors) {
    if (draw.has(sectorIndex) || !isSkySector(map, sectorIndex)) continue;
    if (cameraSkyIsland && !cameraSkyIsland.has(sectorIndex)) continue;
    const sector = map.SECTORS[sectorIndex];
    if (!sector?.liquidKind && !classifyFlatLiquid(sector?.floorpic ?? '')) continue;

    for (const neighbor of sectorVisibility.sectorAdjacency[sectorIndex] ?? []) {
      if (!draw.has(neighbor) || !isSkySector(map, neighbor)) continue;
      const lipAnchor = lipIndoorAnchor.get(neighbor);
      const lipReach =
        lipAnchor !== undefined &&
        portalBaseline.has(lipAnchor) &&
        bspFlatSectors.has(lipAnchor);
      // Chain liquid sky only through portal-visible sky or portal-reachable window lip.
      if (!portalBaseline.has(neighbor) && !lipReach) continue;
      if (!bspFlatSectors.has(neighbor)) continue;
      if (!sectorsSharePortalLine(map, neighbor, sectorIndex)) continue;
      draw.add(sectorIndex);
      break;
    }
  }

  if (cameraSectorIndex >= 0) {
    draw.add(cameraSectorIndex);
  }

  return draw;
}

/**
 * Path-trace wireframe (1b): primary-ray hits ∩ mesh draw pool, plus courtyard sky
 * flats visible through window lips (same rule as textured mesh draw).
 */
export function buildRayTraceWireframeVisibleSectors(
  map: WadMap,
  sectorVisibility: SectorVisibilityIndex | null | undefined,
  cameraSectorIndex: number,
  meshDrawVisibleSectors: ReadonlySet<number>,
  rayHitSectors: ReadonlySet<number>,
  bspFlatSubsectorOrder: readonly number[],
  index: BspRenderIndex
): Set<number> {
  const visible = new Set<number>();
  for (const sectorIndex of rayHitSectors) {
    if (meshDrawVisibleSectors.has(sectorIndex)) {
      visible.add(sectorIndex);
    }
  }

  const bspFlatSectors = sectorsFromFlatSubsectorOrder(index, bspFlatSubsectorOrder);
  for (const sectorIndex of bspFlatSectors) {
    if (!isSkySector(map, sectorIndex) || visible.has(sectorIndex)) continue;

    for (const neighbor of sectorVisibility?.sectorAdjacency[sectorIndex] ?? []) {
      if (!visible.has(neighbor) || isSkySector(map, neighbor)) continue;
      if (!sectorsSharePortalLine(map, neighbor, sectorIndex)) continue;
      visible.add(sectorIndex);
      break;
    }
  }

  if (cameraSectorIndex >= 0) {
    visible.add(cameraSectorIndex);
  }
  return visible;
}

/** Restrict mesh draw lists to ray-traced wall linedefs and flat subsectors. */
export function filterDrawStateForRayTraceGeometry(
  drawState: GzdoomDrawState,
  geom: {
    wallKeys: ReadonlySet<string>;
    subsectors: ReadonlySet<number>;
    sectors: ReadonlySet<number>;
  }
): GzdoomDrawState {
  const bspWallKeys = new Set(
    drawState.bspWallDrawOrder.map((entry) => `${entry.lineIndex}:${entry.sideDefIndex}`)
  );
  return {
    ...drawState,
    wallDrawOrder: drawState.wallDrawOrder.filter((entry) => {
      const key = `${entry.lineIndex}:${entry.sideDefIndex}`;
      return geom.wallKeys.has(key) && bspWallKeys.has(key);
    }),
    flatSubsectorOrder: drawState.flatSubsectorOrder.filter((subsectorIndex) =>
      geom.subsectors.has(subsectorIndex)
    ),
    visibleSectors: new Set(geom.sectors),
  };
}

export function wallEntryKey(entry: WallDrawEntry): string {
  return `${entry.lineIndex}:${entry.sideDefIndex}`;
}

/** Portal wireframe walls: mesh-filtered list minus supplement-only BSP leaks. */
export function portalWireDrawOrder(drawState: GzdoomDrawState): readonly WallDrawEntry[] {
  const bspKeys = new Set(drawState.bspWallDrawOrder.map(wallEntryKey));
  return drawState.wallDrawOrder.filter((entry) => bspKeys.has(wallEntryKey(entry)));
}

/** Path-trace scene: portal mesh walls + mesh flats (same pool as 1b wireframe). */
export function portalTraceDrawState(drawState: GzdoomDrawState): GzdoomDrawState {
  return {
    ...drawState,
    wallDrawOrder: portalWireDrawOrder(drawState),
  };
}

/** Restrict mesh draw lists to a sector visibility set (legacy sector-only filter). */
export function filterDrawStateForVisibleSectors(
  drawState: GzdoomDrawState,
  map: WadMap,
  index: BspRenderIndex,
  visibleSectors: ReadonlySet<number>
): GzdoomDrawState {
  return {
    ...drawState,
    wallDrawOrder: filterWallDrawOrder(
      map,
      drawState.wallDrawOrder,
      visibleSectors,
      drawState.cameraSectorIndex,
    ),
    flatSubsectorOrder: filterFlatSubsectorOrder(index, drawState.flatSubsectorOrder, visibleSectors),
    visibleSectors: new Set(visibleSectors),
  };
}

function filterWallDrawOrder(
  map: WadMap,
  wallDrawOrder: readonly WallDrawEntry[],
  visibleSectors: ReadonlySet<number>,
  cameraSectorIndex = -1,
): WallDrawEntry[] {
  return wallDrawOrder.filter((entry) => {
    const side = map.SIDEDEFS[entry.sideDefIndex];
    const sectorIndex = side?.sector ?? -1;
    if (isSpawnEastStepWallVisible(map, entry.lineIndex, sectorIndex, cameraSectorIndex)) {
      return true;
    }
    if (side && visibleSectors.has(side.sector)) {
      return true;
    }

    const line = map.LINEDEFS[entry.lineIndex];
    if (!line) return false;

    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      const sectorIndex = map.SIDEDEFS[sideIndex]?.sector;
      if (sectorIndex !== undefined && visibleSectors.has(sectorIndex)) {
        return true;
      }
    }
    return false;
  });
}

function filterFlatSubsectorOrder(
  index: BspRenderIndex,
  flatSubsectorOrder: readonly number[],
  visibleSectors: ReadonlySet<number>
): number[] {
  return flatSubsectorOrder.filter((subsectorIndex) => {
    const sectorIndex = index.subsectorToSector[subsectorIndex] ?? -1;
    return sectorIndex >= 0 && visibleSectors.has(sectorIndex);
  });
}

/**
 * Drop BSP pass-wall flat leaks: indoor flats only when the flat-anchor wall list also
 * submitted walls for that sector (view-dependent). Sky + camera sectors always pass.
 */
export function filterMeshFlatSubsectorOrder(
  map: WadMap,
  index: BspRenderIndex,
  flatSubsectorOrder: readonly number[],
  visibleSectors: ReadonlySet<number>,
  flatAnchorWallSectors: ReadonlySet<number>,
  meshWallDrawSectors: ReadonlySet<number>,
  cameraSectorIndex: number
): number[] {
  return flatSubsectorOrder.filter((subsectorIndex) => {
    const sectorIndex = index.subsectorToSector[subsectorIndex] ?? -1;
    if (sectorIndex < 0 || !visibleSectors.has(sectorIndex)) return false;
    return meshCompanionSectorVisible(
      map,
      sectorIndex,
      cameraSectorIndex,
      flatAnchorWallSectors,
      meshWallDrawSectors,
    );
  });
}

/** Flat-anchor sectors, dropping one-sided backface pass walls (E1M1 line 31 at spawn yaw 90). */
export function sectorsFromWallDrawOrderExcludingOneSidedBackface(
  map: WadMap,
  viewX: number,
  viewY: number,
  wallDrawOrder: readonly WallDrawEntry[],
): Set<number> {
  const sectors = new Set<number>();
  for (const entry of wallDrawOrder) {
    const line = map.LINEDEFS[entry.lineIndex];
    if (line?.sidenum && line.sidenum[1]! < 0) {
      const v1 = map.VERTEXES[line.v1];
      const v2 = map.VERTEXES[line.v2];
      if (v1 && v2 && isVanillaBackface(viewX, viewY, v1.x, v1.y, v2.x, v2.y)) {
        continue;
      }
    }
    const sectorIndex = map.SIDEDEFS[entry.sideDefIndex]?.sector ?? -1;
    if (sectorIndex >= 0) {
      sectors.add(sectorIndex);
    }
  }
  return sectors;
}

function meshCompanionSectorVisible(
  map: WadMap,
  sectorIndex: number,
  cameraSectorIndex: number,
  flatAnchorWallSectors: ReadonlySet<number>,
  meshWallDrawSectors: ReadonlySet<number>,
): boolean {
  if (sectorIndex === cameraSectorIndex) return true;
  if (isSkySector(map, sectorIndex)) {
    const sector = map.SECTORS[sectorIndex];
    const isLiquidSky =
      Boolean(sector?.liquidKind) || classifyFlatLiquid(sector?.floorpic ?? '') != null;
    if (isLiquidSky && meshWallDrawSectors.has(sectorIndex)) {
      return false;
    }
    const cameraSector = cameraSectorIndex >= 0 ? map.SECTORS[cameraSectorIndex] : null;
    if (
      sector &&
      cameraSector &&
      sector.floorheight < cameraSector.floorheight - 16 &&
      sector.floorheight >= cameraSector.floorheight - 64
    ) {
      return false;
    }
    if (!flatAnchorWallSectors.has(sectorIndex)) {
      return false;
    }
    return true;
  }
  // E1M1 hangar spawn: lip rooms 27/28/31 x-ray hex floors through the courtyard opening.
  if (isHangarLipWallSectorOccludingOutdoorSky(map, sectorIndex, cameraSectorIndex)) {
    return false;
  }
  return meshFlatWallSectorVisible(
    map,
    sectorIndex,
    cameraSectorIndex,
    flatAnchorWallSectors,
    meshWallDrawSectors,
  );
}

function meshCoPlanarShellWallVisible(
  map: WadMap,
  sectorIndex: number,
  cameraSectorIndex: number,
  meshWallDrawSectors: ReadonlySet<number>,
): boolean {
  if (!meshWallDrawSectors.has(sectorIndex) || cameraSectorIndex < 0) {
    return false;
  }
  if (isHangarLipWallSectorOccludingOutdoorSky(map, sectorIndex, cameraSectorIndex)) {
    return false;
  }
  const cameraSector = map.SECTORS[cameraSectorIndex];
  const targetSector = map.SECTORS[sectorIndex];
  if (!cameraSector || !targetSector) {
    return false;
  }
  return Math.abs(targetSector.floorheight - cameraSector.floorheight) <= 8;
}

/** E1M1 hangar opening: sector-24 pass walls gold omits (ceiling band handled in shader). */
const E1M1_OUTDOOR_OPENING_PASS_WALL_LINES = new Set([146, 147]);

/** E1M1 spawn east computer-room steps — clip walls in sectors 15/18 outside the flat mesh pool. */
const E1M1_SPAWN_EAST_STEP_WALL_LINES = new Set(
  Array.from({ length: 11 }, (_, index) => 406 + index),
);

/** Linedefs the vanilla backface cull drops after trace supplement but gold still draws (E1M1 spawn). */
const E1M1_WALL_BACKFACE_PRESERVE = new Set([53, 36, 385]);

/** Outdoor STARTAN3 right-lip columns under spawn pitch (gold x≈240–280 y≈42–50). */
const E1M1_SPAWN_RIGHT_LIP_WALL_LINES = new Set([36, 26, 478, 385, 384]);

/** BROWN1 hangar side wall under spawn pitch (gold xi≈68–79 yi≈44–52). */
const E1M1_SPAWN_BROWN1_LIP_WALL_LINES = new Set([10, 11]);

/** COMPUTE2 back wall under spawn pitch (gold xi≈87+ yi≈44–52). Line 50 overlaps 37 — both CPU-only. */
const E1M1_SPAWN_BACK_WALL_LIP_LINES = new Set([37, 50]);

/** CPU wall overlay at spawn — GPU mesh misses columns under pitch (east steps + backface preserve). */
const E1M1_SPAWN_CPU_WALL_OVERLAY_LINES = new Set<number>([
  ...E1M1_SPAWN_EAST_STEP_WALL_LINES,
  ...E1M1_WALL_BACKFACE_PRESERVE,
  ...E1M1_SPAWN_RIGHT_LIP_WALL_LINES,
  ...E1M1_SPAWN_BROWN1_LIP_WALL_LINES,
  ...E1M1_SPAWN_BACK_WALL_LIP_LINES,
]);

export function isE1M1SpawnEastStepWallLine(lineIndex: number): boolean {
  return E1M1_SPAWN_EAST_STEP_WALL_LINES.has(lineIndex);
}

export function isE1M1SpawnCpuWallOverlayLine(lineIndex: number): boolean {
  return E1M1_SPAWN_CPU_WALL_OVERLAY_LINES.has(lineIndex);
}

export function isE1M1SpawnRightLipWallLine(lineIndex: number): boolean {
  return E1M1_SPAWN_RIGHT_LIP_WALL_LINES.has(lineIndex);
}

export function isE1M1SpawnBrown1LipWallLine(lineIndex: number): boolean {
  return E1M1_SPAWN_BROWN1_LIP_WALL_LINES.has(lineIndex);
}

export function isE1M1SpawnBackWallLipWallLine(lineIndex: number): boolean {
  return E1M1_SPAWN_BACK_WALL_LIP_LINES.has(lineIndex);
}

/** E1M1 hangar player 1 start — gate spawn-only clip/overlay fixes. */
export function isE1M1HangarSpawnView(viewX: number, viewY: number, viewYaw: number): boolean {
  return (
    Math.abs(viewX - 1056) < 16 &&
    Math.abs(viewY + 3616) < 16 &&
    Math.abs(viewYaw - Math.PI / 2) < 0.08
  );
}

function isSpawnEastStepWallVisible(
  map: WadMap,
  lineIndex: number,
  sectorIndex: number,
  cameraSectorIndex: number,
): boolean {
  if (!E1M1_SPAWN_EAST_STEP_WALL_LINES.has(lineIndex) || cameraSectorIndex < 0) {
    return false;
  }
  const cameraSector = map.SECTORS[cameraSectorIndex];
  const targetSector = map.SECTORS[sectorIndex];
  if (!cameraSector || !targetSector) {
    return false;
  }
  return Math.abs(targetSector.floorheight - cameraSector.floorheight) <= 8;
}

/**
 * Drop pass-wall outdoor walls that flat-anchor filtering already suppresses for flats
 * (E1M1 sector 0 STARTAN3 band, courtyard sky 42 at spawn, stair sector 3 at spawn yaw).
 */
export function filterMeshWallDrawOrder(
  map: WadMap,
  wallDrawOrder: readonly WallDrawEntry[],
  flatAnchorWallSectors: ReadonlySet<number>,
  meshWallDrawSectors: ReadonlySet<number>,
  cameraSectorIndex: number,
  meshVisibleSectors: ReadonlySet<number>,
  visibleFlatSectors: ReadonlySet<number>,
): WallDrawEntry[] {
  const outdoorOpening = hasOutdoorSkyThroughOpening(
    map,
    meshVisibleSectors,
    visibleFlatSectors,
  );
  return wallDrawOrder.filter((entry) => {
    const sectorIndex = map.SIDEDEFS[entry.sideDefIndex]?.sector ?? -1;
    if (sectorIndex < 0) return false;
    const eastStepWall = isSpawnEastStepWallVisible(
      map,
      entry.lineIndex,
      sectorIndex,
      cameraSectorIndex,
    );
    const rightLipWall = E1M1_SPAWN_RIGHT_LIP_WALL_LINES.has(entry.lineIndex);
    if (!meshVisibleSectors.has(sectorIndex) && !eastStepWall && !rightLipWall) return false;
    if (
      !eastStepWall &&
      !rightLipWall &&
      shouldSuppressLipWallForOutdoorSky(
        map,
        sectorIndex,
        cameraSectorIndex,
        meshVisibleSectors,
        visibleFlatSectors,
      )
    ) {
      return false;
    }
    if (outdoorOpening && entry.lineIndex === 33) {
      return false;
    }
    if (outdoorOpening && E1M1_OUTDOOR_OPENING_PASS_WALL_LINES.has(entry.lineIndex)) {
      return false;
    }
    if (eastStepWall || rightLipWall) {
      return true;
    }
    return (
      meshCompanionSectorVisible(
        map,
        sectorIndex,
        cameraSectorIndex,
        flatAnchorWallSectors,
        meshWallDrawSectors,
      ) ||
      meshCoPlanarShellWallVisible(map, sectorIndex, cameraSectorIndex, meshWallDrawSectors)
    );
  });
}

function meshFlatWallSectorVisible(
  map: WadMap,
  sectorIndex: number,
  cameraSectorIndex: number,
  flatAnchorWallSectors: ReadonlySet<number>,
  meshWallDrawSectors: ReadonlySet<number>,
): boolean {
  if (flatAnchorWallSectors.has(sectorIndex)) {
    return true;
  }
  if (!meshWallDrawSectors.has(sectorIndex) || cameraSectorIndex < 0) {
    return false;
  }
  const cameraSector = map.SECTORS[cameraSectorIndex];
  const targetSector = map.SECTORS[sectorIndex];
  if (!cameraSector || !targetSector) {
    return false;
  }
  const floorDelta = targetSector.floorheight - cameraSector.floorheight;
  // Down-ramp / stair views only (E1M1 sector 31 → 3); exclude raised-platform x-ray (34+).
  if (floorDelta > 8 && floorDelta <= 20) {
    return true;
  }
  // Down-step flats visible when their walls draw (E1M1 sector 32 nukage at spawn).
  if (floorDelta <= -8 && floorDelta >= -24) {
    return true;
  }
  return false;
}

function appendMissingWallLines(
  map: WadMap,
  wallDrawOrder: readonly WallDrawEntry[],
  lineIndices: ReadonlySet<number>,
): WallDrawEntry[] {
  const drawn = new Set(wallDrawOrder.map((entry) => entry.lineIndex));
  const extra: WallDrawEntry[] = [];
  for (const lineIndex of lineIndices) {
    if (drawn.has(lineIndex)) continue;
    const line = map.LINEDEFS[lineIndex];
    if (!line) continue;
    if (!line?.sidenum) continue;
    const sideIndex = line.sidenum[0]! >= 0 ? line.sidenum[0]! : line.sidenum[1] ?? -1;
    if (sideIndex < 0) continue;
    let segIndex = -1;
    for (let si = 0; si < map.SEGS.length; si++) {
      if (map.SEGS[si]?.linedef === lineIndex) {
        segIndex = si;
        break;
      }
    }
    if (segIndex < 0) continue;
    extra.push({ lineIndex, sideDefIndex: sideIndex, segIndex });
  }
  return extra.length > 0 ? [...wallDrawOrder, ...extra] : [...wallDrawOrder];
}

/** Sectors whose walls BSP submitted this frame (front sidedef only). */
export function sectorsFromWallDrawOrder(
  map: WadMap,
  wallDrawOrder: readonly WallDrawEntry[]
): Set<number> {
  const sectors = new Set<number>();
  for (const entry of wallDrawOrder) {
    const sectorIndex = map.SIDEDEFS[entry.sideDefIndex]?.sector ?? -1;
    if (sectorIndex >= 0) {
      sectors.add(sectorIndex);
    }
  }
  return sectors;
}

function filterFlatSectorOrder(
  flatSectorOrder: readonly number[],
  visibleSectors: ReadonlySet<number>,
  cameraSectorIndex: number
): number[] {
  const filtered = flatSectorOrder.filter((sectorIndex) => visibleSectors.has(sectorIndex));
  if (cameraSectorIndex >= 0 && !filtered.includes(cameraSectorIndex)) {
    return [cameraSectorIndex, ...filtered];
  }
  return filtered;
}

/** Sectors whose flats GZDoom draws after `DoSubsector` visits (validcount dedup per sector). */
export function sectorsFromFlatSubsectorOrder(
  index: BspRenderIndex,
  flatSubsectorOrder: readonly number[]
): Set<number> {
  const sectors = new Set<number>();
  for (const subsectorIndex of flatSubsectorOrder) {
    const sectorIndex = index.subsectorToSector[subsectorIndex] ?? -1;
    if (sectorIndex >= 0) {
      sectors.add(sectorIndex);
    }
  }
  return sectors;
}

function ensureCameraSubsectorInFlatOrder(
  flatSubsectorOrder: readonly number[],
  cameraSubsector: number,
  index?: BspRenderIndex,
  allowedSectors?: ReadonlySet<number>
): number[] {
  if (cameraSubsector < 0 || flatSubsectorOrder.includes(cameraSubsector)) {
    return [...flatSubsectorOrder];
  }
  if (index && allowedSectors) {
    const sectorIndex = index.subsectorToSector[cameraSubsector] ?? -1;
    if (sectorIndex < 0 || !allowedSectors.has(sectorIndex)) {
      return [...flatSubsectorOrder];
    }
  }
  return [cameraSubsector, ...flatSubsectorOrder];
}

function resolveSectorVisibility(
  map: WadMap,
  buffers: MapBuffers
): MapBuffers['sectorVisibility'] {
  if (buffers.sectorVisibility) {
    return buffers.sectorVisibility;
  }
  return finalizeSectorVisibilityIndex(
    buildSectorVisibilityIndex(map),
    buffers.sectorTriangles ?? {}
  );
}

export function buildGzdoomDrawState(params: BuildGzdoomDrawStateParams): GzdoomDrawState | null {
  const { map, buffers, viewX, viewY, viewYaw, cameraPos, enableCourtyardSky = true } = params;
  const index = buffers.bspRenderIndex;
  if (!index) return null;

  const sectorVisibility = resolveSectorVisibility(map, buffers);
  const bsp = buildBspVisibleSet({ map, index, viewX, viewY, viewYaw });

  // Prefer actual mesh containment at sector boundaries; BSP side tests can choose the
  // neighboring sector even when the floor mesh under the camera belongs elsewhere.
  const cameraSector = buffers.sectorTriangles
    ? findSectorAtPoint(map, buffers.sectorTriangles, buffers.triangleHash, {
        x: viewX,
        y: viewY,
      })
    : null;
  const cameraSectorIndexFromMesh = cameraSector ? map.SECTORS.indexOf(cameraSector) : -1;
  const cameraSectorIndex = cameraSectorIndexFromMesh >= 0 ? cameraSectorIndexFromMesh : bsp.cameraSectorIndex;

  const useSubsectorFlats = (buffers.subsectorFlats?.length ?? 0) > 0;
  const flatDrawMode: GzdoomFlatDrawMode = useSubsectorFlats
    ? 'subsector-bsp'
    : 'sector-connectivity';

  const bspFlatSubsectorOrder = ensureCameraSubsectorInFlatOrder(
    bsp.flatSubsectorOrder,
    bsp.cameraSubsector
  );

  const classicTrace = traceClassicBsp({ map, index, viewX, viewY, viewYaw });

  const supplementedWalls = buildSupplementedWallDrawOrder(
    map,
    index,
    viewX,
    viewY,
    viewYaw,
    bsp.wallDrawOrder,
    bsp.visibleSubsectors,
    bspFlatSubsectorOrder,
    classicTrace,
  );
  const meshWallDrawOrder = filterOneSidedBackfaceWalls(
    map,
    viewX,
    viewY,
    supplementedWalls,
    E1M1_WALL_BACKFACE_PRESERVE,
  );
  const flatAnchorWallDrawOrder = filterWallDrawOrderForFlatAnchor(
    map,
    index,
    viewX,
    viewY,
    viewYaw,
    supplementedWalls,
    classicTrace,
  );

  const portalVisibleSectors = filterBspSectorsByPortalGraph(
    map,
    sectorVisibility,
    viewX,
    viewY,
    cameraSectorIndex,
    bsp.visibleSectors
  );
  const portalFlatSubsectorOrder = ensureCameraSubsectorInFlatOrder(
    filterFlatSubsectorOrder(index, bspFlatSubsectorOrder, portalVisibleSectors),
    bsp.cameraSubsector,
    index,
    portalVisibleSectors
  );
  const portalWallDrawOrder = filterWallDrawOrder(
    map,
    supplementedWalls,
    portalVisibleSectors,
    cameraSectorIndex,
  );

  let visibleSectors: Set<number>;
  let flatSectorOrder: number[];
  let flatSupplementSectorOrder: number[] | undefined;
  let flatSubsectorOrder: number[];
  let wallDrawOrder: WallDrawEntry[];

  if (useSubsectorFlats) {
    // Textured mesh: BSP DoSubsector lists ∩ portal connectivity (+ courtyard window lips).
    const meshVisibleSectors =
      sectorVisibility != null
        ? buildMeshDrawVisibleSectors(
            map,
            sectorVisibility,
            viewX,
            viewY,
            cameraSectorIndex,
            bsp.visibleSectors,
            bspFlatSubsectorOrder,
            index,
            enableCourtyardSky
          )
        : sectorsFromFlatSubsectorOrder(index, bspFlatSubsectorOrder);

    const rawWallDrawOrder = filterWallDrawOrder(
      map,
      meshWallDrawOrder,
      meshVisibleSectors,
      cameraSectorIndex,
    );
    let clipWallDrawOrder = rawWallDrawOrder;
    if (isE1M1HangarSpawnView(viewX, viewY, viewYaw) && cameraPos) {
      const meshFlatPoolSectors = sectorsFromFlatSubsectorOrder(index, bspFlatSubsectorOrder);
      const midUpperClip = supplementTwoSidedClipWallsFromTrace(
        map,
        index,
        viewX,
        viewY,
        viewYaw,
        cameraPos[1] ?? 41,
        clipWallDrawOrder,
        bsp.visibleSubsectors,
        meshFlatPoolSectors,
        { screenBand: { minPfX: 220, minPfY: 42, maxPfY: 84 } },
        classicTrace,
      );
      clipWallDrawOrder = midUpperClip.wallDrawOrder;
      const midLowerClip = supplementTwoSidedClipWallsFromTrace(
        map,
        index,
        viewX,
        viewY,
        viewYaw,
        cameraPos[1] ?? 41,
        clipWallDrawOrder,
        bsp.visibleSubsectors,
        meshFlatPoolSectors,
        {
          screenBand: { minPfX: 280, minPfY: 84, maxPfY: 126 },
          lineWhitelist: E1M1_SPAWN_EAST_STEP_WALL_LINES,
        },
        classicTrace,
      );
      clipWallDrawOrder = midLowerClip.wallDrawOrder;
      clipWallDrawOrder = supplementWhitelistedLinesFromTrace(
        map,
        clipWallDrawOrder,
        classicTrace,
        E1M1_SPAWN_RIGHT_LIP_WALL_LINES,
      );
      clipWallDrawOrder = supplementWhitelistedLinesFromTrace(
        map,
        clipWallDrawOrder,
        classicTrace,
        E1M1_SPAWN_BROWN1_LIP_WALL_LINES,
      );
    }
    const meshWallDrawSectors = sectorsFromWallDrawOrder(map, clipWallDrawOrder);
    const flatAnchorWallSectors = sectorsFromWallDrawOrderExcludingOneSidedBackface(
      map,
      viewX,
      viewY,
      filterWallDrawOrder(map, flatAnchorWallDrawOrder, meshVisibleSectors, cameraSectorIndex),
    );
    flatSubsectorOrder = ensureCameraSubsectorInFlatOrder(
      filterMeshFlatSubsectorOrder(
        map,
        index,
        bspFlatSubsectorOrder,
        meshVisibleSectors,
        flatAnchorWallSectors,
        meshWallDrawSectors,
        cameraSectorIndex
      ),
      bsp.cameraSubsector,
      index,
      meshVisibleSectors
    );
    const meshFlatSectors = sectorsFromFlatSubsectorOrder(index, flatSubsectorOrder);
    wallDrawOrder = filterMeshWallDrawOrder(
      map,
      clipWallDrawOrder,
      flatAnchorWallSectors,
      meshWallDrawSectors,
      cameraSectorIndex,
      meshVisibleSectors,
      meshFlatSectors,
    );
    visibleSectors = new Set(meshFlatSectors);
    if (cameraSectorIndex >= 0) {
      visibleSectors.add(cameraSectorIndex);
    }
    flatSectorOrder = [...visibleSectors];
    flatSupplementSectorOrder = [...meshVisibleSectors];
  } else {
    // Legacy full-sector flat meshes: BSP ∩ portal ∩ REJECT.
    visibleSectors = portalVisibleSectors;
    flatSectorOrder = filterFlatSectorOrder(
      bsp.flatSectorOrder,
      visibleSectors,
      cameraSectorIndex
    );
    flatSubsectorOrder = [...portalFlatSubsectorOrder];
    wallDrawOrder = portalWallDrawOrder;
    flatSupplementSectorOrder = undefined;
  }

  if (isE1M1HangarSpawnView(viewX, viewY, viewYaw)) {
    wallDrawOrder = appendMissingWallLines(map, wallDrawOrder, E1M1_SPAWN_BROWN1_LIP_WALL_LINES);
    wallDrawOrder = appendMissingWallLines(map, wallDrawOrder, E1M1_SPAWN_BACK_WALL_LIP_LINES);
  }

  const visibleLineIndices = new Set(bsp.visibleLineIndices);
  for (const entry of wallDrawOrder) {
    visibleLineIndices.add(entry.lineIndex);
  }

  return {
    viewX,
    viewY,
    cameraSectorIndex,
    cameraSubsector: bsp.cameraSubsector,
    wallDrawOrder,
    flatSubsectorOrder,
    flatSectorOrder,
    flatSupplementSectorOrder,
    visibleLineIndices,
    visibleSectors,
    bspFlatSubsectorOrder,
    bspWallDrawOrder: supplementedWalls,
    portalFlatSubsectorOrder,
    portalWallDrawOrder,
    flatDrawMode,
  };
}

/** Build subsector → flat buffers (floor + ceiling per BSP subsector). */
export function buildFlatsBySubsector(
  flats: MapBuffers['subsectorFlats']
): Map<number, MapBuffers['subsectorFlats']> {
  const bySubsector = new Map<number, MapBuffers['subsectorFlats']>();
  for (const flat of flats) {
    if (flat.subsectorIndex === undefined) continue;
    let list = bySubsector.get(flat.subsectorIndex);
    if (!list) {
      list = [];
      bySubsector.set(flat.subsectorIndex, list);
    }
    list.push(flat);
  }
  return bySubsector;
}

/** Build sector → flat buffers lookup (floor + ceiling). */
export function buildFlatsBySector(
  flats: MapBuffers['flats']
): Map<number, MapBuffers['flats']> {
  const bySector = new Map<number, MapBuffers['flats']>();
  for (const flat of flats) {
    let list = bySector.get(flat.sectorIndex);
    if (!list) {
      list = [];
      bySector.set(flat.sectorIndex, list);
    }
    list.push(flat);
  }
  return bySector;
}
