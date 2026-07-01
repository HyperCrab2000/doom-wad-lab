import { mat4 } from 'gl-matrix';

/**
 * Portal ray-sight wireframe: mesh HW pool filtered by primary-ray hits on solid
 * walls/floors/ceilings. Intentionally low-res + throttled — not a per-frame path.
 */
import {
  filterDrawStateForRayTraceGeometry,
  portalTraceDrawState,
  type GzdoomDrawState,
} from '@/wad/renderer/bsp/gzdoomDrawState';
import { getViewAnglesFromViewMatrix } from '@/wad/renderer/controls/playerView';
import type { DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';
import { pathTracePortalWireframeSurfaceMask } from '@/wad/renderer/modular/renderLayerToggles';
import { buildSceneTrianglesSync } from '@/wad/renderer/rtgl/rtglResourceCache';
import type { SceneTriangle } from '@/wad/renderer/rtgl/buildSceneTriangles';
import {
  buildTriangleSpatialIndex,
  type TriangleSpatialIndex,
} from '@/wad/renderer/rtgl/pathTraceAccel';
import {
  collectRayTracedVisibleGeometry,
  createEmptyRayTraceVisibleGeometry,
  extendRayTraceGeometryCourtyardLips,
  type RayTraceVisibleGeometry,
} from '@/wad/renderer/rtgl/collectRayTracedVisibleSectors';

/** Recompute sight at most ~4 Hz while the view moves. */
const SIGHT_MIN_INTERVAL_MS = 250;
/** Pixel stride for CPU primary rays (lower-res grid). */
const SIGHT_SAMPLE_STEP = 16;
const SIGHT_MAX_WIDTH = 480;
const SIGHT_MAX_HEIGHT = 270;

let cachedPortalTriangles: SceneTriangle[] | null = null;
let cachedPortalSpatial: TriangleSpatialIndex | null = null;
let cachedPortalGeomKey = -1;
let cachedSightGeom: RayTraceVisibleGeometry | null = null;
let cachedSightVisKey = -1;
let lastSightMs = 0;

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function portalMeshKey(drawState: GzdoomDrawState): number {
  const portal = portalTraceDrawState(drawState);
  let hash = 2166136261;
  for (const entry of portal.wallDrawOrder) {
    hash ^= entry.lineIndex;
    hash = Math.imul(hash, 16777619);
    hash ^= entry.sideDefIndex;
    hash = Math.imul(hash, 16777619);
  }
  for (const subsector of portal.flatSubsectorOrder) {
    hash ^= subsector;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sightCacheKey(params: DrawSceneParams, drawState: GzdoomDrawState): number {
  const c = params.cameraPos;
  const yaw = getViewAnglesFromViewMatrix(params.viewMatrix).yaw;
  const coarse = `${Math.round(c[0] / 64)},${Math.round(c[1] / 32)},${Math.round(c[2] / 64)},${Math.round((yaw * 180) / Math.PI / 4)}`;
  return hashString(coarse) ^ portalMeshKey(drawState);
}

function sightRayResolution(viewWidth: number, viewHeight: number): { width: number; height: number } {
  if (viewWidth <= SIGHT_MAX_WIDTH && viewHeight <= SIGHT_MAX_HEIGHT) {
    return { width: viewWidth, height: viewHeight };
  }
  const scale = Math.min(SIGHT_MAX_WIDTH / viewWidth, SIGHT_MAX_HEIGHT / viewHeight);
  return {
    width: Math.max(160, Math.round(viewWidth * scale)),
    height: Math.max(90, Math.round(viewHeight * scale)),
  };
}

function resolvePortalMeshTriangles(
  params: DrawSceneParams,
  portalState: GzdoomDrawState
): { triangles: readonly SceneTriangle[]; spatial: TriangleSpatialIndex } {
  const geomKey = portalMeshKey(portalState);
  if (geomKey === cachedPortalGeomKey && cachedPortalTriangles && cachedPortalSpatial) {
    return { triangles: cachedPortalTriangles, spatial: cachedPortalSpatial };
  }
  const triangles =
    buildSceneTrianglesSync(
      params.wadPath ?? '',
      params.mapName ?? '',
      params.map,
      portalState,
      params.buffers,
      {
        cameraPos: params.cameraPos,
        modelViewProjMatrix: params.modelViewProjMatrix,
      }
    ) ?? [];
  cachedPortalTriangles = triangles;
  cachedPortalSpatial = buildTriangleSpatialIndex(triangles);
  cachedPortalGeomKey = geomKey;
  return { triangles, spatial: cachedPortalSpatial };
}

const invViewProj = mat4.create();

/**
 * Primary-ray hits on portal-solid mesh (walls + floors + ceilings).
 * Occludes geometry behind solid surfaces regardless of portal draw distance.
 */
export function computePortalWireframeSightGeometry(
  params: DrawSceneParams,
  drawState: GzdoomDrawState
): RayTraceVisibleGeometry {
  const index = params.buffers.bspRenderIndex;
  const empty = createEmptyRayTraceVisibleGeometry();
  if (!index) {
    if (drawState.cameraSectorIndex >= 0) {
      empty.sectors.add(drawState.cameraSectorIndex);
    }
    return empty;
  }

  const visKey = sightCacheKey(params, drawState);
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (cachedSightGeom) {
    if (visKey === cachedSightVisKey) {
      return cachedSightGeom;
    }
    if (now - lastSightMs < SIGHT_MIN_INTERVAL_MS) {
      return cachedSightGeom;
    }
  }

  const portalState = portalTraceDrawState(drawState);
  const { triangles, spatial } = resolvePortalMeshTriangles(params, portalState);

  if (triangles.length === 0) {
    if (drawState.cameraSubsector >= 0) {
      empty.subsectors.add(drawState.cameraSubsector);
    }
    if (drawState.cameraSectorIndex >= 0) {
      empty.sectors.add(drawState.cameraSectorIndex);
    }
    cachedSightGeom = empty;
    cachedSightVisKey = visKey;
    lastSightMs = now;
    return empty;
  }

  mat4.copy(invViewProj, params.invViewProjMatrix);
  const layoutW = Math.max(1, params.playfieldLayout.width);
  const layoutH = Math.max(1, params.playfieldLayout.height);
  const { width, height } = sightRayResolution(layoutW, layoutH);
  const geom = collectRayTracedVisibleGeometry(triangles, invViewProj, width, height, {
    surfaceMask: pathTracePortalWireframeSurfaceMask(),
    sampleStep: SIGHT_SAMPLE_STEP,
    occludeAlphaClip: true,
    spatial,
  });

  if (drawState.cameraSubsector >= 0) {
    geom.subsectors.add(drawState.cameraSubsector);
  }
  if (drawState.cameraSectorIndex >= 0) {
    geom.sectors.add(drawState.cameraSectorIndex);
  }
  extendRayTraceGeometryCourtyardLips(
    params.map,
    params.buffers.sectorVisibility,
    drawState,
    index,
    geom,
    params.renderLayerToggles?.courtyardSky !== false
  );

  cachedSightGeom = geom;
  cachedSightVisKey = visKey;
  lastSightMs = now;
  return geom;
}

/** Ray sight: mesh pool ∩ primary-ray hits (walls block sight; no draw-distance cull). */
export function resolvePortalCulledWireframeDrawState(
  params: DrawSceneParams,
  drawState: GzdoomDrawState
): GzdoomDrawState {
  const geom = computePortalWireframeSightGeometry(params, drawState);
  return filterDrawStateForRayTraceGeometry(portalTraceDrawState(drawState), geom);
}

export function clearPortalWireframeSightCache(): void {
  cachedPortalTriangles = null;
  cachedPortalSpatial = null;
  cachedPortalGeomKey = -1;
  cachedSightGeom = null;
  cachedSightVisKey = -1;
  lastSightMs = 0;
}

export function getPortalWireframeSightGeometry(): RayTraceVisibleGeometry | null {
  return cachedSightGeom;
}
