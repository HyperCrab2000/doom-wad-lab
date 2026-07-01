import type { WadMap } from '@/wad/interfaces/WadMap';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import {
  buildBspVisibleSet,
  type WallDrawEntry,
} from '@/wad/renderer/bsp/bspVisibility';
import { buildSupplementedWallDrawOrder } from '@/wad/renderer/bsp/supplementWallDraw';
import {
  buildPortalVisibleSectors,
  buildSectorVisibilityIndex,
  finalizeSectorVisibilityIndex,
  sectorsSharePortalLine,
  type SectorVisibilityIndex,
} from '@/wad/renderer/utils/sectorVisibility';
import { isSkySector } from '@/wad/renderer/utils/sectorSkyVisibility';
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
  for (const sectorIndex of bspFlatSectors) {
    if (!isSkySector(map, sectorIndex) || draw.has(sectorIndex)) continue;

    for (const neighbor of sectorVisibility.sectorAdjacency[sectorIndex] ?? []) {
      if (isSkySector(map, neighbor)) continue;
      // Lip room must appear in BSP flats (window opening), not pass-wall-only wall visits.
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
    wallDrawOrder: filterWallDrawOrder(map, drawState.wallDrawOrder, visibleSectors),
    flatSubsectorOrder: filterFlatSubsectorOrder(index, drawState.flatSubsectorOrder, visibleSectors),
    visibleSectors: new Set(visibleSectors),
  };
}

function filterWallDrawOrder(
  map: WadMap,
  wallDrawOrder: readonly WallDrawEntry[],
  visibleSectors: ReadonlySet<number>
): WallDrawEntry[] {
  return wallDrawOrder.filter((entry) => {
    const side = map.SIDEDEFS[entry.sideDefIndex];
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
 * Drop BSP pass-wall flat leaks: indoor flats only when BSP also submitted walls
 * for that sector (view-dependent). Sky + camera sectors always pass.
 */
export function filterMeshFlatSubsectorOrder(
  map: WadMap,
  index: BspRenderIndex,
  flatSubsectorOrder: readonly number[],
  visibleSectors: ReadonlySet<number>,
  bspWallSectors: ReadonlySet<number>,
  cameraSectorIndex: number
): number[] {
  return flatSubsectorOrder.filter((subsectorIndex) => {
    const sectorIndex = index.subsectorToSector[subsectorIndex] ?? -1;
    if (sectorIndex < 0 || !visibleSectors.has(sectorIndex)) return false;
    if (sectorIndex === cameraSectorIndex) return true;
    if (isSkySector(map, sectorIndex)) return true;
    return bspWallSectors.has(sectorIndex);
  });
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

  // BSP subsector walk is authoritative for render visibility (stable at stair lips).
  const cameraSectorIndex = bsp.cameraSectorIndex;

  const useSubsectorFlats = (buffers.subsectorFlats?.length ?? 0) > 0;
  const flatDrawMode: GzdoomFlatDrawMode = useSubsectorFlats
    ? 'subsector-bsp'
    : 'sector-connectivity';

  const bspFlatSubsectorOrder = ensureCameraSubsectorInFlatOrder(
    bsp.flatSubsectorOrder,
    bsp.cameraSubsector
  );

  const supplementedWalls = buildSupplementedWallDrawOrder(
    map,
    index,
    viewX,
    viewY,
    viewYaw,
    bsp.wallDrawOrder,
    bsp.visibleSubsectors,
    bspFlatSubsectorOrder
  );
  const bspWallSectors = sectorsFromWallDrawOrder(map, bsp.wallDrawOrder);

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
  const portalWallDrawOrder = filterWallDrawOrder(map, supplementedWalls, portalVisibleSectors);

  let visibleSectors: Set<number>;
  let flatSectorOrder: number[];
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

    flatSubsectorOrder = ensureCameraSubsectorInFlatOrder(
      filterMeshFlatSubsectorOrder(
        map,
        index,
        bspFlatSubsectorOrder,
        meshVisibleSectors,
        bspWallSectors,
        cameraSectorIndex
      ),
      bsp.cameraSubsector,
      index,
      meshVisibleSectors
    );
    wallDrawOrder = filterWallDrawOrder(map, supplementedWalls, meshVisibleSectors);
    visibleSectors = sectorsFromFlatSubsectorOrder(index, flatSubsectorOrder);
    if (cameraSectorIndex >= 0) {
      visibleSectors.add(cameraSectorIndex);
    }
    flatSectorOrder = [...visibleSectors];
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
