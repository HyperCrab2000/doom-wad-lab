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
  findCameraSectorIndex,
  isSkySector,
} from '@/wad/renderer/utils/sectorVisibility';

/**
 * Per-frame GZDoom HW renderer draw state (`RenderBSP` → draw lists).
 * Walls: BSP `wallDrawOrder` — one sidedef per linedef (`HWWall::Process`).
 * Flats: BSP `flatSectorOrder` — sector floor/ceiling (mesh renderer; one mesh per sector).
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
}

export interface BuildGzdoomDrawStateParams {
  map: WadMap;
  buffers: MapBuffers;
  viewX: number;
  viewY: number;
  viewYaw: number;
  cameraPos: [number, number, number];
}

/** BSP-visible sectors restricted to the portal graph (courtyard / sky islands). */
export function filterBspSectorsByPortalGraph(
  map: WadMap,
  sectorVisibility: MapBuffers['sectorVisibility'],
  viewX: number,
  viewY: number,
  cameraSectorIndex: number,
  bspVisibleSectors: ReadonlySet<number>
): Set<number> {
  if (!sectorVisibility || cameraSectorIndex < 0) {
    return new Set(bspVisibleSectors);
  }

  const portalVisible = buildPortalVisibleSectors(
    sectorVisibility,
    map,
    viewX,
    viewY,
    cameraSectorIndex
  );

  // Trust BSP angular clipper + depth buffer for indoor sectors.
  // Only filter sky sectors by island (prevents hangar↔courtyard cross-island leaking).
  // The depth buffer naturally hides geometry behind solid walls, so courtyard indoor
  // sectors visible in BSP from spawn are correctly occluded at render time.
  const filtered = new Set<number>();
  for (const sectorIndex of bspVisibleSectors) {
    if (!isSkySector(map, sectorIndex)) {
      filtered.add(sectorIndex); // indoor: trust BSP + depth test
    } else if (portalVisible.has(sectorIndex)) {
      filtered.add(sectorIndex); // sky: same island only
    }
  }
  filtered.add(cameraSectorIndex);
  return filtered;
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

export function buildGzdoomDrawState(params: BuildGzdoomDrawStateParams): GzdoomDrawState | null {
  const { map, buffers, viewX, viewY, viewYaw, cameraPos } = params;
  const index = buffers.bspRenderIndex;
  if (!index) return null;

  const bsp = buildBspVisibleSet({ map, index, viewX, viewY, viewYaw });

  const triangleSector = buffers.triangleHash
    ? findCameraSectorIndex(
        map,
        buffers.sectorTriangles,
        buffers.triangleHash,
        cameraPos,
        buffers.sectorVisibility
      )
    : -1;

  const cameraSectorIndex =
    triangleSector >= 0 ? triangleSector : bsp.cameraSectorIndex;

  const visibleSectors = filterBspSectorsByPortalGraph(
    map,
    buffers.sectorVisibility,
    viewX,
    viewY,
    cameraSectorIndex,
    bsp.visibleSectors
  );

  let flatSectorOrder = filterFlatSectorOrder(
    bsp.flatSectorOrder,
    visibleSectors,
    cameraSectorIndex
  );
  let flatSubsectorOrder = filterFlatSubsectorOrder(
    index,
    bsp.flatSubsectorOrder,
    visibleSectors
  );

  if (bsp.cameraSubsector >= 0 && !flatSubsectorOrder.includes(bsp.cameraSubsector)) {
    flatSubsectorOrder = [bsp.cameraSubsector, ...flatSubsectorOrder];
  }

  const supplementedWalls = buildSupplementedWallDrawOrder(
    map,
    index,
    viewX,
    viewY,
    viewYaw,
    bsp.wallDrawOrder,
    bsp.visibleSubsectors
  );
  const wallDrawOrder = filterWallDrawOrder(map, supplementedWalls, visibleSectors);

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
