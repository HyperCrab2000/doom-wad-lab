import type { WadMap } from '@/wad/interfaces/WadMap';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildBspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';
import {
  buildGzdoomDrawState,
  sectorsFromFlatSubsectorOrder,
} from '@/wad/renderer/bsp/gzdoomDrawState';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { isSkySector } from '@/wad/renderer/utils/sectorSkyVisibility';
import type { CourtyardMapAnalysis, CourtyardProbe } from '@/wad/renderer/courtyard/discoverCourtyards';
import {
  buildConnectivityVisibleSectors,
  type CourtyardVisibilitySnapshot,
} from '@/wad/renderer/courtyard/courtyardInvariants';
import { buildPortalVisibleSectors } from '@/wad/renderer/utils/sectorVisibility';

export const COURTYARD_PROBE_YAWS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const;

export interface CourtyardProbeContext {
  map: WadMap;
  analysis: CourtyardMapAnalysis;
  bspIndex: NonNullable<MapBuffers['bspRenderIndex']>;
  subsectorFlats: MapBuffers['subsectorFlats'];
}

export function createCourtyardProbeContext(
  map: WadMap,
  analysis: CourtyardMapAnalysis
): CourtyardProbeContext | null {
  const bspIndex = buildBspRenderIndex(map);
  if (!bspIndex) return null;
  const subsectorFlats = mapToSubsectorFlats(map, bspIndex);
  return { map, analysis, bspIndex, subsectorFlats };
}

export function probeCourtyardVisibility(
  ctx: CourtyardProbeContext,
  probe: CourtyardProbe,
  viewYaw: number
): CourtyardVisibilitySnapshot | null {
  const { map, analysis, bspIndex } = ctx;
  const bsp = buildBspVisibleSet({
    map,
    index: bspIndex,
    viewX: probe.x,
    viewY: probe.y,
    viewYaw,
  });

  const cameraSectorIndex = bsp.cameraSectorIndex;
  const portalVisible = buildPortalVisibleSectors(
    analysis.index,
    map,
    probe.x,
    probe.y,
    cameraSectorIndex
  );
  const connectivityVisible = buildConnectivityVisibleSectors(
    map,
    analysis.index,
    probe.x,
    probe.y,
    cameraSectorIndex
  );

  const drawState = buildGzdoomDrawState({
    map,
    buffers: {
      bspRenderIndex: bspIndex,
      sectorTriangles: {},
      triangleHash: null,
      sectorVisibility: analysis.index,
      wallRangesByLine: [],
      flats: [],
      subsectorFlats: ctx.subsectorFlats,
    } as MapBuffers,
    viewX: probe.x,
    viewY: probe.y,
    viewYaw,
    cameraPos: [probe.x, 41, -probe.y],
  });

  if (!drawState) return null;

  const bspFlatVisible = sectorsFromFlatSubsectorOrder(bspIndex, bsp.flatSubsectorOrder);
  if (cameraSectorIndex >= 0) {
    bspFlatVisible.add(cameraSectorIndex);
  }

  return {
    probe,
    viewYaw,
    cameraSectorIndex,
    bspVisible: bsp.visibleSectors,
    bspFlatVisible,
    portalVisible,
    connectivityVisible,
    drawVisible: drawState.visibleSectors,
    flatDrawMode: drawState.flatDrawMode,
  };
}

export function islandForProbe(
  analysis: CourtyardMapAnalysis,
  probe: CourtyardProbe
): CourtyardMapAnalysis['islands'][number] | undefined {
  return analysis.islands.find((island) => island.islandId === probe.islandId);
}

/** Resolve courtyard island from the BSP camera sector (may differ from probe label). */
export function islandForCameraSector(
  map: WadMap,
  analysis: CourtyardMapAnalysis,
  cameraSectorIndex: number
): CourtyardMapAnalysis['islands'][number] | undefined {
  if (cameraSectorIndex < 0) return undefined;

  if (isSkySector(map, cameraSectorIndex)) {
    const islandId = analysis.skyIslandIds[cameraSectorIndex];
    return analysis.islands.find((island) => island.islandId === islandId);
  }

  return analysis.islands.find(
    (island) =>
      island.windowRooms.includes(cameraSectorIndex) ||
      island.skySectors.includes(cameraSectorIndex)
  );
}
