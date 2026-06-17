import { mat4 } from 'gl-matrix';

import type { DrawSceneParams } from '@/wad/renderer/renderGame/drawScene';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { getViewAnglesFromViewMatrix } from '@/wad/renderer/controls/playerView';
import { getEffectiveSectorLightLevel } from '@/wad/renderer/renderGame/sectorDynamicLight';
import { DEFAULT_VISIBILITY_DISTANCE } from '@/wad/constants/RenderInfo';
import { mapLoadCacheKey } from '@/wad/renderer/renderGame/mapLoadCache';
import { VANILLA_3D_HEIGHT, VANILLA_SCREEN_WIDTH } from '@/wad/renderer/renderGame/gameViewLayout';
import { buildSceneTrianglesSync, prewarmPathTraceScene } from './rtglResourceCache';
import type { SceneTriangle } from './buildSceneTriangles';
import { packSceneTriangles } from './packSceneTriangles';
import { decodePackedVertex } from './packSceneTriangles';
import { createBuffer } from 'apl-easy-gl';

import {
  blitPathTraceCanvasToPlayfield,
  clearPathTraceCanvas,
  createPathTraceGpuState,
  createPathTraceMainBlitState,
  drawFullscreenQuad,
  ensureLowResTarget,
  readCanvasTraceHitRatio,
  uploadPointLights,
  type PathTraceGpuState,
  type PathTraceMainBlitState,
} from './pathTraceGpu';
import {
  getOffscreenPathTraceCanvas,
  getOffscreenPathTraceGl,
  resetOffscreenPathTraceGl,
} from './pathTraceOffscreen';
import {
  atlasLookupKey,
  buildTextureAtlas,
  clearTextureAtlasCache,
  type AtlasEntry,
} from './textureAtlas';
import { isFullResPathTraceEnabled } from '@/wad/renderer/renderBackend';
import {
  buildRenderLayerDrawPlan,
  pathTraceSurfaceMask,
  type RenderLayerToggles,
} from '@/wad/renderer/modular/renderLayerToggles';
import { getEmissiveColor } from '@/wad/renderer/renderGame/lightingHeuristics';
import { remapColorsForPathTrace } from './pathTraceColors';
import {
  clearPortalWireframeSightCache,
  computePortalWireframeSightGeometry,
  getPortalWireframeSightGeometry,
} from './portalWireframeSight';
import {
  type RayTraceVisibleGeometry,
} from './collectRayTracedVisibleSectors';

export type PathTraceDrawStatus = 'drew' | 'pending' | 'failed';

export interface PathTraceDrawResult {
  status: PathTraceDrawStatus;
}

export interface PathTraceDrawOptions {
  /** Discard path-trace sky pixels so a forward skybox can show through. */
  keySky?: boolean;
  /** Skip magenta letterbox clear (sky already drawn on main canvas). */
  preserveLetterbox?: boolean;
}

function buildFlatSources(params: DrawSceneParams): Map<string, { graphics: CanvasRenderingContext2D }> {
  const flatSources = new Map<string, { graphics: CanvasRenderingContext2D }>();
  for (const flat of params.wadAssets.flats) {
    flatSources.set(flat.name, flat);
    flatSources.set(flat.name.toUpperCase(), flat);
  }
  for (const [name, flatTex] of Object.entries(params.textures.flats)) {
    if (!flatTex?.graphics) continue;
    flatSources.set(name, flatTex);
    flatSources.set(name.toUpperCase(), flatTex);
  }
  return flatSources;
}

export interface PathTraceDebugInfo {
  triangleCount: number;
  error: string | null;
  traceWidth: number;
  traceHeight: number;
  viewWidth: number;
  viewHeight: number;
  traceMs: number;
  traceScale: number;
  traceBackend: 'gpu' | 'failed';
  hitRatio: number;
  rayTraceWireframeSectorCount: number;
}

export interface RtglBackend {
  drawPathTraceScene(params: DrawSceneParams, wadPath?: string | null, mapName?: string): Promise<void>;
  dispose(): void;
}

const PATH_TRACE_SHADER_REV = 51;
/** Voxel meshes explode triangle count; enabled via layer toggle. */
const PATH_TRACE_INCLUDE_VOXELS = false;
let loadedShaderRev = 0;
let gpuState: PathTraceGpuState | null = null;
let mainBlitState: PathTraceMainBlitState | null = null;
let mainQuadBuffer: ReturnType<typeof createBuffer> | null = null;
let gpuAvailable = true;
const invViewProj = mat4.create();
let lastTriangleCount = 0;
let lastPathTraceError: string | null = null;
let lastTraceWidth = 0;
let lastTraceHeight = 0;
let lastViewWidth = 0;
let lastViewHeight = 0;
let lastTraceMs = 0;
let lastHitRatio = 0;
let lastTraceBackend: 'gpu' | 'failed' = 'gpu';
let cachedVisibilityKey = -1;
let cachedGeometryKey = -1;
let cachedPackedGeomKey = -1;
let cachedSceneTriangles: NonNullable<ReturnType<typeof buildSceneTrianglesSync>> | null = null;
let cachedPacked: ReturnType<typeof packSceneTriangles> | null = null;
let cachedAtlasKey = '';
let cachedAtlas: ReturnType<typeof buildTextureAtlas> | null = null;
let cachedAtlasTexNames = '';
let cachedSkyKey = '';
let uploadedTriW = 0;
let uploadedTriH = 0;
const ADAPTIVE_MIN_SCALE = 0.38;
const ADAPTIVE_MAX_SCALE = 0.72;
const ADAPTIVE_TARGET_MS = 14;
const ADAPTIVE_TUNE_INTERVAL = 6;
const ADAPTIVE_SCALE_LEVELS = [0.38, 0.48, 0.58, 0.65, 0.72] as const;
let adaptiveScale = defaultAdaptiveScale();
let adaptiveScaleLevel = defaultScaleLevel();
let adaptiveTuneCounter = 0;
let smoothedTraceMs = ADAPTIVE_TARGET_MS;
let hitCheckCounter = 0;

function defaultAdaptiveScale(): number {
  if (isFullResPathTraceEnabled()) return 1;
  return 0.48;
}

function shouldAutoTuneScale(): boolean {
  return !isFullResPathTraceEnabled();
}

function defaultScaleLevel(): number {
  const scale = defaultAdaptiveScale();
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ADAPTIVE_SCALE_LEVELS.length; i++) {
    const dist = Math.abs(ADAPTIVE_SCALE_LEVELS[i]! - scale);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function applyAdaptiveScaleLevel(level: number): void {
  adaptiveScaleLevel = Math.max(0, Math.min(ADAPTIVE_SCALE_LEVELS.length - 1, level));
  adaptiveScale = ADAPTIVE_SCALE_LEVELS[adaptiveScaleLevel]!;
}

function maxAdaptiveScale(): number {
  return isFullResPathTraceEnabled() ? 1 : ADAPTIVE_MAX_SCALE;
}

function tuneAdaptiveScale(traceMs: number): void {
  if (!shouldAutoTuneScale()) return;
  smoothedTraceMs = smoothedTraceMs * 0.75 + traceMs * 0.25;
  adaptiveTuneCounter += 1;
  if (adaptiveTuneCounter % ADAPTIVE_TUNE_INTERVAL !== 0) return;

  const maxLevel = isFullResPathTraceEnabled()
    ? ADAPTIVE_SCALE_LEVELS.length - 1
    : ADAPTIVE_SCALE_LEVELS.findIndex((scale) => scale >= maxAdaptiveScale());
  const cappedMaxLevel = maxLevel >= 0 ? maxLevel : ADAPTIVE_SCALE_LEVELS.length - 1;

  if (smoothedTraceMs > ADAPTIVE_TARGET_MS * 3 && adaptiveScaleLevel > 0) {
    applyAdaptiveScaleLevel(Math.max(0, adaptiveScaleLevel - 2));
  } else if (smoothedTraceMs > ADAPTIVE_TARGET_MS * 1.35 && adaptiveScaleLevel > 0) {
    applyAdaptiveScaleLevel(adaptiveScaleLevel - 1);
  } else if (smoothedTraceMs < ADAPTIVE_TARGET_MS * 0.85 && adaptiveScaleLevel < cappedMaxLevel) {
    applyAdaptiveScaleLevel(adaptiveScaleLevel + 1);
  }
}

export function tunePathTraceFromFrameMs(frameMs: number): void {
  lastTraceMs = Math.round(frameMs);
}

function pathTraceResolution(viewWidth: number, viewHeight: number): { width: number; height: number } {
  const scale = isFullResPathTraceEnabled() ? 1 : adaptiveScale;
  return {
    width: Math.max(160, Math.round(viewWidth * scale)),
    height: Math.max(84, Math.round(viewHeight * scale)),
  };
}

export function getPathTraceDebugInfo(): PathTraceDebugInfo {
  return {
    triangleCount: lastTriangleCount,
    error: lastPathTraceError,
    traceWidth: lastTraceWidth,
    traceHeight: lastTraceHeight,
    viewWidth: lastViewWidth,
    viewHeight: lastViewHeight,
    traceMs: lastTraceMs,
    traceScale: adaptiveScale,
    traceBackend: lastTraceBackend === 'failed' ? 'failed' : 'gpu',
    hitRatio: lastHitRatio,
    rayTraceWireframeSectorCount: getPortalWireframeSightGeometry()?.sectors.size ?? 0,
  };
}

/** Sectors visible to path-trace primary rays (cached after last GPU trace). */
export function getRayTraceWireframeVisibleSectors(): ReadonlySet<number> | null {
  return getPortalWireframeSightGeometry()?.sectors ?? null;
}

/** Full ray-hit geometry for portal wireframe (walls + subsectors). */
export function getRayTraceWireframeGeometry(): RayTraceVisibleGeometry | null {
  return getPortalWireframeSightGeometry();
}

function updateRayTraceWireframeVisibleSectors(
  params: DrawSceneParams,
  drawState: GzdoomDrawState,
  layerToggles: RenderLayerToggles
): void {
  if (layerToggles.wireframeMode !== 'sight') {
    clearPortalWireframeSightCache();
    return;
  }
  computePortalWireframeSightGeometry(params, drawState);
}

/** @deprecated Use computePortalWireframeSightGeometry from portalWireframeSight. */
export function computePathTraceWireframeGeometry(
  params: DrawSceneParams,
  drawState: GzdoomDrawState
): RayTraceVisibleGeometry {
  return computePortalWireframeSightGeometry(params, drawState);
}

function hashInvViewProj(m: mat4 | Float32Array): number {
  let h = 2166136261;
  for (let i = 0; i < 16; i++) {
    h ^= Math.floor(m[i]! * 1000);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** @deprecated Use computePathTraceWireframeGeometry */
export function computeRayTraceWireframeVisibleSectors(
  params: DrawSceneParams,
  drawState: GzdoomDrawState,
  _surfaceMask: number
): Set<number> {
  return computePathTraceWireframeGeometry(params, drawState).sectors;
}

export { prewarmPathTraceScene };

function ensureMainBlitState(mainGl: WebGL2RenderingContext): void {
  if (!mainBlitState) {
    mainBlitState = createPathTraceMainBlitState(mainGl);
    mainQuadBuffer = createBuffer(mainGl, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2);
  }
}

export function resetPathTraceGpu(): void {
  gpuState = null;
  mainBlitState = null;
  mainQuadBuffer = null;
  resetOffscreenPathTraceGl();
  gpuAvailable = true;
  cachedVisibilityKey = -1;
  cachedGeometryKey = -1;
  cachedPackedGeomKey = -1;
  cachedSceneTriangles = null;
  clearPortalWireframeSightCache();
  cachedPacked = null;
  cachedAtlasKey = '';
  cachedAtlas = null;
  cachedAtlasTexNames = '';
  cachedSkyKey = '';
  uploadedTriW = 0;
  uploadedTriH = 0;
  lastPathTraceError = null;
  lastHitRatio = 0;
  lastTraceBackend = 'gpu';
  loadedShaderRev = PATH_TRACE_SHADER_REV;
  clearTextureAtlasCache();
}

function geometryCacheKey(drawState: GzdoomDrawState, animateSpriteIndex: number): number {
  return visibilityKey(drawState) ^ (animateSpriteIndex * 2654435761);
}

function eyeFromViewMatrix(viewMatrix: mat4): [number, number, number] {
  const invView = mat4.invert(mat4.create(), viewMatrix);
  if (!invView) return [0, 0, 0];
  return [invView[12], invView[13], invView[14]];
}

function getDrawState(params: DrawSceneParams): GzdoomDrawState | null {
  if (!params.buffers.bspRenderIndex) return null;
  const viewAngles = getViewAnglesFromViewMatrix(params.viewMatrix);
  const cameraPos = eyeFromViewMatrix(params.viewMatrix);
  return buildGzdoomDrawState({
    map: params.map,
    buffers: params.buffers,
    viewX: cameraPos[0],
    viewY: -cameraPos[2],
    viewYaw: viewAngles.yaw,
    cameraPos,
  });
}

function visibilityKey(drawState: GzdoomDrawState): number {
  let hash = 2166136261;
  for (const entry of drawState.wallDrawOrder) {
    hash ^= entry.lineIndex;
    hash = Math.imul(hash, 16777619);
    hash ^= entry.sideDefIndex;
    hash = Math.imul(hash, 16777619);
  }
  for (const subsector of drawState.flatSubsectorOrder) {
    hash ^= subsector;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function uploadTriangleTexture(
  gl: WebGL2RenderingContext,
  state: PathTraceGpuState,
  packed: ReturnType<typeof packSceneTriangles>
): void {
  gl.bindTexture(gl.TEXTURE_2D, state.triangleTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    packed.width,
    packed.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    packed.dataBytes
  );
  uploadedTriW = packed.width;
  uploadedTriH = packed.height;

  gl.bindTexture(gl.TEXTURE_2D, state.colorTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    packed.colorWidth,
    packed.colorHeight,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    packed.colorData
  );
}

function uploadSectorLight(
  gl: WebGL2RenderingContext,
  state: PathTraceGpuState,
  map: DrawSceneParams['map'],
  timeSeconds: number
): void {
  const width = 256;
  const height = 4;
  const lightArr = new Uint8Array(width * height * 4);
  for (let i = 0; i < map.SECTORS.length && i < width; i++) {
    const sector = map.SECTORS[i]!;
    const level = Math.round((getEffectiveSectorLightLevel(sector, timeSeconds) / 255) * 255);
    const ambient = sector.ambientColor ?? [1, 1, 1];
    const fogColor = sector.fogColor ?? [0.025, 0.022, 0.02];
    const visibilityDistance = sector.visibilityDistance ?? DEFAULT_VISIBILITY_DISTANCE;
    const fogDensity = sector.fogDensity ?? 0.25;
    const visU16 = Math.min(65535, Math.max(0, Math.round(visibilityDistance)));

    const row0 = i * 4;
    lightArr[row0] = level;
    lightArr[row0 + 3] = 255;

    const row1 = (width + i) * 4;
    lightArr[row1] = Math.round(Math.min(1, ambient[0]) * 255);
    lightArr[row1 + 1] = Math.round(Math.min(1, ambient[1]) * 255);
    lightArr[row1 + 2] = Math.round(Math.min(1, ambient[2]) * 255);
    lightArr[row1 + 3] = 255;

    const row2 = (width * 2 + i) * 4;
    lightArr[row2] = Math.round(Math.min(1, fogColor[0]) * 255);
    lightArr[row2 + 1] = Math.round(Math.min(1, fogColor[1]) * 255);
    lightArr[row2 + 2] = Math.round(Math.min(1, fogColor[2]) * 255);
    lightArr[row2 + 3] = 255;

    const row3 = (width * 3 + i) * 4;
    lightArr[row3] = visU16 & 0xff;
    lightArr[row3 + 1] = (visU16 >> 8) & 0xff;
    lightArr[row3 + 2] = Math.round(Math.min(1, fogDensity) * 255);
    lightArr[row3 + 3] = 255;
  }
  gl.bindTexture(gl.TEXTURE_2D, state.sectorLightTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, lightArr);
}

function resetGlStateForPathTrace(gl: WebGL2RenderingContext): void {
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);
  gl.bindVertexArray(null);
  for (let i = 0; i < 8; i++) {
    gl.disableVertexAttribArray(i);
  }
}

function uploadSkyTexture(
  gl: WebGL2RenderingContext,
  state: PathTraceGpuState,
  skyName: string,
  sourceCanvas: HTMLCanvasElement | null | undefined
): boolean {
  if (!sourceCanvas) {
    return false;
  }
  const key = `${skyName}::${sourceCanvas.width}x${sourceCanvas.height}`;
  if (key === cachedSkyKey) {
    return true;
  }
  gl.bindTexture(gl.TEXTURE_2D, state.skyTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
  cachedSkyKey = key;
  return true;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function drawGpuPathTrace(
  gl: WebGL2RenderingContext,
  state: PathTraceGpuState,
  packed: ReturnType<typeof packSceneTriangles>,
  atlas: ReturnType<typeof buildTextureAtlas>,
  invViewProjMatrix: mat4,
  cameraPos: [number, number, number],
  pointLightCount: number,
  ptWidth: number,
  ptHeight: number,
  surfaceMask: number,
  layerFlags: {
    useTextures: boolean;
    dynamicLights: boolean;
    coloredLights: boolean;
  },
  skyYaw: number,
  skyPitch: number,
  hasSky: boolean,
  renderToScreen = false
): void {
  const u = state.uniforms;
  resetGlStateForPathTrace(gl);
  if (renderToScreen) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  } else {
    ensureLowResTarget(gl, state, ptWidth, ptHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.lowResFbo);
  }
  gl.viewport(0, 0, ptWidth, ptHeight);
  gl.clearColor(0.45, 0.62, 0.88, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const prog = state.pathTraceProgram;
  gl.useProgram(prog);
  gl.uniformMatrix4fv(u.invViewProj!, false, invViewProjMatrix);
  gl.uniform2f(u.traceSize!, ptWidth, ptHeight);
  gl.uniform1i(u.triangleCount!, packed.count);
  gl.uniform1i(u.triangleTexWidth!, packed.width);
  gl.uniform1i(u.atlasCols!, atlas.cols);
  gl.uniform1i(u.atlasRows!, atlas.rows);
  gl.uniform1i(u.surfaceMask!, surfaceMask);
  gl.uniform1i(u.useTextures!, layerFlags.useTextures ? 1 : 0);
  gl.uniform1i(u.dynamicLights!, layerFlags.dynamicLights ? 1 : 0);
  gl.uniform1i(u.coloredLights!, layerFlags.coloredLights ? 1 : 0);
  gl.uniform3f(u.packOrigin!, packed.bounds.origin[0], packed.bounds.origin[1], packed.bounds.origin[2]);
  gl.uniform3f(u.packScale!, packed.bounds.scale[0], packed.bounds.scale[1], packed.bounds.scale[2]);
  gl.uniform3f(u.cameraPos!, cameraPos[0], cameraPos[1], cameraPos[2]);
  gl.uniform1i(u.pointLightCount!, pointLightCount);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.triangleTexture);
  gl.uniform1i(u.triangles!, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, state.colorTexture);
  gl.uniform1i(u.triColors!, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, state.sectorLightTexture);
  gl.uniform1i(u.sectorLight!, 2);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
  gl.uniform1i(u.atlas!, 3);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, state.pointLightTexture);
  gl.uniform1i(u.pointLights!, 4);
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, state.skyTexture);
  gl.uniform1i(u.sky!, 5);
  gl.uniform1f(u.skyYaw!, skyYaw);
  gl.uniform1f(u.skyPitch!, skyPitch);
  gl.uniform1f(u.hasSky!, hasSky ? 1 : 0);

  drawFullscreenQuad(gl, state.quadBuffer, prog);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

export function drawPathTraceSync(
  params: DrawSceneParams,
  wadPath?: string | null,
  mapName?: string,
  options: PathTraceDrawOptions = {}
): PathTraceDrawResult {
  const { gl, map } = params;
  const resolvedMapName = mapName ?? params.mapName ?? '';
  const resolvedWadPath = wadPath ?? params.wadPath ?? null;

  if (loadedShaderRev !== PATH_TRACE_SHADER_REV) {
    resetPathTraceGpu();
  }

  if (!gpuState && gpuAvailable) {
    try {
      const offscreenGl = getOffscreenPathTraceGl();
      gpuState = createPathTraceGpuState(offscreenGl);
      ensureMainBlitState(gl);
    } catch (error) {
      gpuAvailable = false;
      lastPathTraceError = error instanceof Error ? error.message : String(error);
      lastTraceBackend = 'failed';
      clearPathTraceCanvas(gl);
      return { status: 'failed' };
    }
  }

  if (!gpuState || !gpuAvailable) {
    lastTraceBackend = 'failed';
    clearPathTraceCanvas(gl);
    return { status: 'failed' };
  }

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  const drawState = getDrawState(params);
  if (!drawState || !resolvedMapName) {
    lastTriangleCount = 0;
    lastPathTraceError = 'No BSP draw state';
    lastTraceBackend = 'failed';
    clearPathTraceCanvas(gl);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    return { status: 'failed' };
  }

  const layerToggles: RenderLayerToggles =
    params.renderLayerToggles ?? {
      wireframeMode: 'off',
      meshTriangles: false,
      courtyardSky: true,
      solidWalls: true,
      wallTextures: true,
      solidCeilings: true,
      ceilingTextures: true,
      solidFloors: true,
      floorTextures: true,
      animatedLiquid: true,
      sky: true,
      dynamicLighting: true,
      coloredLighting: true,
      voxels: false,
    };
  const layerPlan = buildRenderLayerDrawPlan(layerToggles);
  const includeVoxels = layerToggles.voxels;

  const visKey = visibilityKey(drawState);
  const geomKey = geometryCacheKey(drawState, params.animateSpriteIndex ?? 0);
  let triangles = cachedSceneTriangles;
  if (geomKey !== cachedGeometryKey || !triangles) {
    triangles = buildSceneTrianglesSync(
      resolvedWadPath,
      resolvedMapName,
      map,
      drawState,
      params.buffers,
      {
        cameraPos: params.cameraPos,
        modelViewProjMatrix: params.modelViewProjMatrix,
        renderableThings: params.renderableThings,
        sortedFramesByThingName: params.sortedFramesByThingName,
        animateSpriteIndex: params.animateSpriteIndex,
        voxelThingFrames: includeVoxels ? params.voxelThingFrames : undefined,
        timeSeconds: params.timeSeconds,
        extraPalette: includeVoxels ? new Map<string, [number, number, number]>() : undefined,
      }
    );
    if (triangles) {
      cachedSceneTriangles = triangles;
      cachedGeometryKey = geomKey;
    }
  }
  if (!triangles) {
    lastPathTraceError = 'Geometry loading';
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    return { status: 'pending' };
  }

  lastTriangleCount = triangles.length;
  if (triangles.length === 0) {
    lastPathTraceError = 'No visible triangles';
    lastTraceBackend = 'failed';
    clearPathTraceCanvas(gl);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    return { status: 'failed' };
  }

  try {
    const offscreenGl = getOffscreenPathTraceGl();
    const offscreenCanvas = getOffscreenPathTraceCanvas();
    ensureMainBlitState(gl);

    const flatSources = buildFlatSources(params);
    const spriteSources = new Map(
      params.wadAssets.sprites.map((sprite) => [sprite.name, sprite] as const)
    );
    const spriteColors = new Map<string, [number, number, number]>();
    for (const sprite of params.wadAssets.sprites) {
      spriteColors.set(sprite.name, getEmissiveColor(sprite.graphics.canvas));
    }
    const atlasEntries: AtlasEntry[] = [];
    const seenAtlasKeys = new Set<string>();
    for (const tri of triangles) {
      if (!tri.texName || tri.texName === '-') continue;
      const key = atlasLookupKey(tri.texName, tri.surfaceKind);
      if (seenAtlasKeys.has(key)) continue;
      seenAtlasKeys.add(key);
      atlasEntries.push({ texName: tri.texName, surfaceKind: tri.surfaceKind });
    }
    atlasEntries.sort((a, b) => atlasLookupKey(a.texName, a.surfaceKind).localeCompare(
      atlasLookupKey(b.texName, b.surfaceKind)
    ));
    const texNamesKey = atlasEntries.map((e) => atlasLookupKey(e.texName, e.surfaceKind)).join('\0');
    const atlasKey = `${mapLoadCacheKey(resolvedWadPath, resolvedMapName)}::atlas::offscreen`;
    const atlasCacheKey = `${atlasKey}::${hashString(texNamesKey)}`;

    let atlasRebuilt = false;
    if (atlasCacheKey !== cachedAtlasKey || texNamesKey !== cachedAtlasTexNames || !cachedAtlas) {
      cachedAtlas = buildTextureAtlas(
        offscreenGl,
        atlasEntries,
        params.wallTexturesByName,
        flatSources,
        spriteSources
      );
      cachedAtlasKey = atlasCacheKey;
      cachedAtlasTexNames = texNamesKey;
      atlasRebuilt = true;
    }

    if (geomKey !== cachedPackedGeomKey || !cachedPacked || atlasRebuilt) {
      cachedPacked = packSceneTriangles(
        triangles,
        remapColorsForPathTrace(params.wallTextureColors, 0),
        remapColorsForPathTrace(params.floorTextureColors, 1),
        cachedAtlas.indexByName,
        spriteColors
      );
      cachedPackedGeomKey = geomKey;
      cachedVisibilityKey = visKey;
      uploadTriangleTexture(offscreenGl, gpuState, cachedPacked);
    }

    uploadSectorLight(offscreenGl, gpuState, map, params.timeSeconds);
    const pointLightCount = uploadPointLights(
      offscreenGl,
      gpuState.pointLightTexture,
      layerPlan.dynamicLights ? (params.pointLights ?? []) : []
    );

    mat4.copy(invViewProj, params.invViewProjMatrix);
    const layout = params.playfieldLayout;

    const { width: ptW, height: ptH } = pathTraceResolution(layout.width, layout.height);
    lastTraceWidth = ptW;
    lastTraceHeight = ptH;
    lastViewWidth = layout.width;
    lastViewHeight = layout.height;

    offscreenCanvas.width = ptW;
    offscreenCanvas.height = ptH;

    const cameraPos = eyeFromViewMatrix(params.viewMatrix);
    const viewAngles = getViewAnglesFromViewMatrix(params.viewMatrix);
    const skyAsset = params.wadAssets.texturesByName[params.currentSky];
    const hasSky = uploadSkyTexture(offscreenGl, gpuState, params.currentSky, skyAsset?.graphics.canvas);
    const surfaceMask = pathTraceSurfaceMask(layerToggles);
    const layerFlags = {
      useTextures: layerPlan.useTextures,
      dynamicLights: layerPlan.dynamicLights,
      coloredLights: layerPlan.coloredLights,
    };
    const started = performance.now();
    drawGpuPathTrace(
      offscreenGl,
      gpuState,
      cachedPacked,
      cachedAtlas,
      invViewProj,
      cameraPos,
      pointLightCount,
      ptW,
      ptH,
      surfaceMask,
      layerFlags,
      viewAngles.yaw,
      viewAngles.pitch,
      hasSky,
      true
    );
    updateRayTraceWireframeVisibleSectors(params, drawState, layerToggles);
    if (mainBlitState && mainQuadBuffer) {
      blitPathTraceCanvasToPlayfield(
        gl,
        mainBlitState,
        mainQuadBuffer,
        offscreenCanvas,
        layout,
        gl.canvas.width,
        gl.canvas.height,
        Boolean(options.keySky),
        Boolean(options.preserveLetterbox)
      );
    }

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('ptDebug')) {
      (window as unknown as { __ptDebug?: object }).__ptDebug = {
        triCount: triangles.length,
        wallCount: params.buffers.walls.length,
        hasCpuPos: Boolean(params.buffers.walls[0]?.cpuPosition),
        firstTri: triangles[0]?.v0,
        drawWalls: drawState.wallDrawOrder.length,
        wallTris: triangles.filter((t) => t.surfaceKind === 0).length,
        flatTris: triangles.filter((t) => t.surfaceKind === 1).length,
        invViewProj: Array.from(invViewProj),
        playfield: layout,
        traceSize: { w: ptW, h: ptH },
        packCount: cachedPacked.count,
        packV0: decodePackedVertex(cachedPacked.dataBytes, 0, 0, cachedPacked.bounds),
        packBounds: cachedPacked.bounds,
      };
      (window as unknown as { __ptExport?: object }).__ptExport = {
        dataBytes: Array.from(cachedPacked.dataBytes),
        colorData: Array.from(cachedPacked.colorData),
        bounds: cachedPacked.bounds,
        count: cachedPacked.count,
        width: cachedPacked.width,
        height: cachedPacked.height,
        colorWidth: cachedPacked.colorWidth,
        colorHeight: cachedPacked.colorHeight,
        invViewProj: Array.from(invViewProj),
        rw: ptW,
        rh: ptH,
      };
      const fboBuf = new Uint8Array(ptW * ptH * 4);
      offscreenGl.bindFramebuffer(offscreenGl.FRAMEBUFFER, null);
      offscreenGl.readPixels(0, 0, ptW, ptH, offscreenGl.RGBA, offscreenGl.UNSIGNED_BYTE, fboBuf);
      let fboNonSky = 0;
      for (let i = 0; i < fboBuf.length; i += 4) {
        const r = fboBuf[i];
        const g = fboBuf[i + 1];
        const b = fboBuf[i + 2];
        if (!(r === 115 && g === 158 && b === 224)) fboNonSky++;
      }
      (window as unknown as { __ptDebug?: object }).__ptDebug = {
        ...(window as unknown as { __ptDebug?: Record<string, unknown> }).__ptDebug,
        fboNonSkyRatio: fboNonSky / (ptW * ptH),
      };
    }

    const traceMs = performance.now() - started;
    lastTraceMs = Math.round(traceMs);
    tuneAdaptiveScale(traceMs);

    hitCheckCounter += 1;
    if (hitCheckCounter % 120 === 0) {
      lastHitRatio = readCanvasTraceHitRatio(offscreenGl, ptW, ptH);
    }

    lastTraceBackend = 'gpu';
    return { status: 'drew' };
  } catch (error) {
    lastPathTraceError = error instanceof Error ? error.message : String(error);
    lastTraceBackend = 'failed';
    clearPathTraceCanvas(gl);
    return { status: 'failed' };
  } finally {
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }
}

export function createRtglBackend(): RtglBackend {
  return {
    async drawPathTraceScene(params, wadPath, mapName) {
      drawPathTraceSync(params, wadPath, mapName);
    },
    dispose() {
      resetPathTraceGpu();
      applyAdaptiveScaleLevel(defaultScaleLevel());
      adaptiveTuneCounter = 0;
      smoothedTraceMs = ADAPTIVE_TARGET_MS;
      hitCheckCounter = 0;
    },
  };
}
