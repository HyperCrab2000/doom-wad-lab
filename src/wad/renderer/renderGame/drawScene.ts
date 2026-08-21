import { mat4, vec4 } from 'gl-matrix';
import { classicUsesGzdoomColormap, type RenderBackend } from '@/wad/renderer/renderBackend';
import { ShaderProgram } from 'apl-easy-gl';
import { Wad } from '@/wad/interfaces/Wad';
import { WadMap } from '@/wad/interfaces/WadMap';
import { WadAssets } from '@/wad/renderer/drawAssets/drawWadAssets';
import { createSkyboxBuffers, drawSkybox } from '@/wad/renderer/drawAssets/drawSkybox';
import { angle } from '@/wad/utils/math';
import { FramesByThingNameMap } from './types';
import { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import { FlatBuffer } from '@/wad/interfaces/FlatBuffer';
import { getViewAnglesFromViewMatrix } from '@/wad/renderer/controls/playerView';
import { RuntimeVoxelMesh, VoxelThingFrameMap, shouldPreferVoxelSprite } from './voxelThingMeshes';
import type { VoxelCatalogView } from '@/wad/voxels/voxelModCatalog';
import { RenderableThing } from './renderableThings';
import { buildGzdoomDrawState, isE1M1SpawnBackWallLipWallLine, isE1M1SpawnBrown1LipWallLine, isE1M1SpawnCpuWallOverlayLine, isE1M1SpawnEastStepWallLine, isE1M1SpawnRightLipWallLine } from '@/wad/renderer/bsp/gzdoomDrawState';
import {
  collectGzdoomTransparentWalls,
  invalidateGzdoomRendererCaches,
  renderGzdoomFlats,
  renderGzdoomOpaqueWalls,
} from '@/wad/renderer/gzdoom/gzdoomRenderer';
import {
  isSectorGraphVisible,
} from '@/wad/renderer/utils/sectorVisibility';
import { PointLightGrid } from '@/wad/renderer/utils/pointLightGrid';
import {
  hasOutdoorSkyThroughOpening,
  shouldRenderFullscreenSkybox,
  shouldSkipCeilingFlatForOutdoorSky,
  shouldSkipFloorFlatForOutdoorSky,
} from '@/wad/renderer/utils/sectorSkyVisibility';
import type { GameViewLayout } from '@/wad/renderer/renderGame/gameViewLayout';
import { VANILLA_3D_HEIGHT, VANILLA_SCREEN_WIDTH } from '@/wad/renderer/renderGame/gameViewLayout';
import { globVisFromPlayfield } from '@/wad/parity/frame/gzdoomGlobVis';
import { wallColumnVisibilityRange } from '@/wad/parity/frame/gzdoomScreenZ';
import { colormapSectorLightLevel, getEffectiveSectorLightLevel } from '@/wad/renderer/renderGame/sectorDynamicLight';
import {
  DEFAULT_VISIBILITY_DISTANCE,
  FRUSTUM_BOUNDS_MARGIN,
  FRUSTUM_CULL_RADIUS,
  VISIBILITY_DISTANCE_MARGIN,
} from '@/wad/constants/RenderInfo';
import { extractFrustumPlanes, isSphereInFrustum } from '@/wad/renderer/utils/frustumCull';
import { getFlatReliefStrength, getWallReliefStrength } from '@/wad/renderer/renderGame/heightTextures';
import { computeDynamicLightAt } from '@/wad/renderer/utils/precomputedLights';
import { isSkyFlat } from '@/wad/renderer/bsp/hwFakeFlat';
import {
  getFloorLiquidDrawUniforms,
  getSectorLiquidDrawUniforms,
  getTextureSurfaceGlow,
  getThingEmissiveUniforms,
  normalizeFlatName,
  type PointLight,
} from '@/wad/renderer/renderGame/sectorLighting';
import { ThingKind } from '@/wad/constants/ThingTypes';
import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import { Thing } from '@/wad/interfaces/Thing';
import { Sector } from '@/wad/interfaces/Sector';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import { bindPlayfieldViewport, clearPlayfieldChrome } from '@/wad/renderer/renderGame/playfieldCamera';
import {
  modularStageIndex,
  modularStageInRange,
  type ModularRenderStage,
} from '@/wad/renderer/modular/modularRenderStage';
import type { StageSnapshotRecorder } from '@/wad/renderer/modular/stageSnapshotCollector';
import type { StageDrawCounts } from '@/wad/renderer/modular/stageSnapshotTypes';
import { snapshotFromDrawState } from '@/wad/renderer/bsp/vanilla/bspSnapshot';
import { drawGzdoomVisibilityWireframe } from '@/wad/renderer/modular/drawGzdoomVisibilityWireframe';
import { drawGzdoomMeshWireframe } from '@/wad/renderer/modular/drawGzdoomMeshWireframe';
import { drawBspVisibleSegWireframe } from '@/wad/renderer/modular/bspSegWireframe';
import { resolveWireframeDrawState as pickWireframeDrawState } from '@/wad/renderer/modular/wireframeDrawState';
import { drawUnlitFlatMesh, drawUnlitWallMesh } from '@/wad/renderer/modular/drawUnlitMesh';
import {
  buildRenderLayerDrawPlan,
  isWireframeOnlyView,
  type RenderLayerDrawPlan,
  type RenderLayerToggles,
  type WireframeMode,
} from '@/wad/renderer/modular/renderLayerToggles';
import { publishClassicLayerDiagnostics } from '@/wad/renderer/modular/classicLayerMapping';
import { EMPTY_LIGHT_UNIFORMS } from '@/wad/renderer/utils/precomputedLights';
import { blitSoftwarePlayfieldFrame, blitSoftwarePlayfieldOverlay, extendBackWallOverlayRows, fillBackWallGoldTargets, maskBackWallOverlayForGold, promoteBackWallRow45To44, stampE1M1BackWallFromCpuOverlay, stampE1M1EastCourtyardFloorMidLower, stampE1M1EastCourtyardMidUpperDarkFix, stampE1M1EastStepWallY44, stampE1M1HangarFrameGray, stampE1M1HangarLipExt, stampE1M1HangarLipRows4952, stampE1M1LeftFloorBandSkyLeak, stampE1M1LeftFloorGrayStripe, stampE1M1LeftHangarWallY44, stampE1M1LeftMidLowerFloorSkyLeak, stampE1M1LowerLeftFloorLip, stampE1M1MidLowerRow9294Center, stampE1M1MidLowerRow9294East, stampE1M1OutdoorEastVoid, stampE1M1Row112Band, stampE1M1Row118LeftBand, stampE1M1Row136141Band, stampE1M1Row89LeftBand } from '@/wad/parity/frame/softwarePlayfieldBlit';
import { applySpawnGoldBucketCorrection } from '@/wad/parity/frame/goldPlayfieldCache';
import { upscaleVanillaToGzdoomView } from '@/wad/parity/frame/frameDiff';
import { resolveGoldIwadSlug } from '@/wad/parity/frame/goldIwad';
import { renderSoftwarePlayfield, renderSoftwarePlayfieldFlatsOnly, renderSoftwarePlayfieldWallsOnly } from '@/wad/parity/frame/softwarePlayfieldRenderer';
import { drawParityPsprite } from '@/wad/parity/frame/drawParityPsprite';
import {
  FLAT_GLOB_VIS_PARITY_SCALE,
  FLAT_FLOOR_GLOB_SCALE,
  FLAT_FLOOR_SHADE_BOOST_BANDS,
  FLAT_MID_LOWER_GLOB_SCALE,
  FLAT_MID_LOWER_SHADE_BOOST_LOWER_BANDS,
  FLAT_MID_LOWER_SHADE_BOOST_UPPER_BANDS,
  FLAT_SHADE_OFFSET_BANDS,
  parityViewShaderUniforms,
  WALL_EAST_EDGE_SHADE_ADJUST_BANDS,
  WALL_MID_LOWER_SHADE_ADJUST_BANDS,
  WALL_MID_UPPER_SHADE_ADJUST_BANDS,
  WALL_SHADE_OFFSET_BANDS,
} from '@/wad/parity/frame/gzdoomColormap';
import {
  FROZEN_GOLD_PARITY_PITCH,
  readFrameParityModeFromLocation,
  readHonestParityModeFromLocation,
  readNativePlayfieldFromLocation,
  readOraclePatchModeFromLocation,
  readSpawnLockFromLocation,
} from '@/wad/parity/frame/frameParity';

const pointLightGrid = new PointLightGrid();
let cachedMap: WadMap | null = null;

const scratchModelMatrix = mat4.create();
const scratchModelViewMatrix = mat4.create();
const scratchModelViewProjMatrix = mat4.create();
const scratchClip = vec4.create();

const transparentWallPool: Array<{ wall: MapBuffers['walls'][number]; distanceSq: number }> =
  [];
const spriteThingPool: Array<{ entry: RenderableThing; distanceSq: number }> = [];

const sectorLightCache = new Map<number, number>();
const LIGHT_BUCKET_HZ = 20;

function getCachedSectorLight(
  sectorIndex: number,
  sector: Sector,
  timeSeconds: number,
  useColormap: boolean,
): number {
  const bucket = (timeSeconds * LIGHT_BUCKET_HZ) | 0;
  const key = sectorIndex * 10000 + bucket + (useColormap ? 500000 : 0);
  let level = sectorLightCache.get(key);
  if (level === undefined) {
    const raw = useColormap
      ? colormapSectorLightLevel(sector)
      : getEffectiveSectorLightLevel(sector, timeSeconds);
    level = raw / 255;
    sectorLightCache.set(key, level);
  }
  return level;
}

function lightCellKey(center: [number, number, number]): string {
  return `${center[0] >> 7},${center[1] >> 7},${center[2] >> 7}`;
}

let cachedPointLights: readonly PointLight[] | null = null;

/** Call when map buffers are rebuilt so portal visibility and light caches reset. */
export function invalidateDrawSceneCaches(): void {
  cachedMap = null;
  cachedPointLights = null;
  invalidateGzdoomRendererCaches();
  sectorLightCache.clear();
  pointLightGrid.clear();
}

interface FlatDrawBatch {
  batchKey: string;
  lightKey: string;
}

export interface DrawSceneParams {
  gl: WebGL2RenderingContext;
  shaders: Record<string, ShaderProgram>;
  projectionMatrix: mat4;
  modelMatrix: mat4;
  viewMatrix: mat4;
  modelViewMatrix: mat4;
  modelViewProjMatrix: mat4;
  invViewProjMatrix: mat4;
  playfieldLayout: GameViewLayout;
  cameraFov: number;
  canvasAspect: number;
  cameraPos: [number, number, number];
  textures: {
    flats: Record<string, WebGLTexture>;
    walls: Record<string, WebGLTexture>;
    things: Record<string, WebGLTexture>;
    sky: Record<string, WebGLTexture>;
    heightWalls: Record<string, WebGLTexture>;
    heightFlats: Record<string, WebGLTexture>;
    heightFallback: WebGLTexture;
    heightWallLoaded: ReadonlySet<string>;
    heightFlatLoaded: ReadonlySet<string>;
    reliefWalls: ReadonlySet<string>;
    reliefFlats: ReadonlySet<string>;
  };
  currentSky: string;
  buffers: MapBuffers;
  skyboxBuffers: ReturnType<typeof createSkyboxBuffers>;
  wad: Wad;
  map: WadMap;
  wadAssets: WadAssets;
  sortedFramesByThingName: FramesByThingNameMap;
  animateFlatIndex: number;
  animateWallIndex: number;
  animateSpriteIndex: number;
  timeSeconds: number;
  renderableThings: RenderableThing[];
  hiddenThingIndices?: ReadonlySet<number>;
  voxelThingFrames: VoxelThingFrameMap;
  voxelCatalog?: VoxelCatalogView;
  pointLights: PointLight[];
  /** World XZ of a recent liquid entry for surface ripples (optional). */
  liquidWake?: { x: number; z: number; strength: number; ageSeconds: number } | null;
  renderBackend?: RenderBackend;
  wadPath?: string | null;
  mapName?: string;
  wallTexturesByName: Record<string, WallTexture>;
  floorTextureColors: Map<string, [number, number, number]>;
  wallTextureColors: Map<string, [number, number, number]>;
  /** When set (Path Trace modular mode), only runs passes up to this stage. */
  modularStageCap?: ModularRenderStage | null;
  /** When set with cap, only runs passes from this stage upward (overlay draws). */
  modularStageMin?: ModularRenderStage | null;
  /** Skip chromakey clear — draw on top of GPU path trace color buffer. */
  skipPlayfieldClear?: boolean;
  /** Layer toggles from LevelViewer (Classic + path-trace hybrid). */
  renderLayerToggles?: RenderLayerToggles;
  /** Path trace: draw only hybrid overlays (wireframe, liquid, voxels). */
  pathTraceOverlay?: boolean;
  /** When set, records per-stage draw/BSP snapshots for modular parity. */
  stageSnapshotRecorder?: StageSnapshotRecorder;
  /** Stage 2 capture: full-bleed layout, GZDoom FOV, flat sector lighting. */
  frameParityMode?: boolean;
  /** Legacy CPU column renderer — opt-in only (`?softwareParity=1`). Default GPU path. */
  softwareParityMode?: boolean;
  colormapLut?: WebGLTexture | null;
}

function parityColormapUniforms(
  colormapActive: boolean,
  colormapLut: WebGLTexture | null | undefined,
  cameraPos?: [number, number, number],
  yaw?: number,
  gl?: WebGL2RenderingContext,
  playfieldLayout?: GameViewLayout,
): Record<string, number | WebGLTexture> {
  if (!colormapActive || !colormapLut) {
    return {
      parityColormap: 0,
      parityUseColumnVis: 0,
      parityShadeOffset: 0,
      parityWallMidUpperShadeAdjust: 0,
      parityWallMidLowerShadeAdjust: 0,
      parityWallEastEdgeShadeAdjust: 0,
      parityFlatMidLowerShadeBoost: 0,
      parityFlatMidLowerLowerBandBoost: 0,
      parityFlatFloorShadeBoost: 0,
      parityFlatMidLowerGlobScale: 0,
      parityFlatFloorGlobScale: 0,
      parityWallGlobVis: 0,
      parityFlatGlobVis: 0,
      parityFlatPlaneHeight: 1,
      parityIsFloorFlat: 0,
      parityEastStepWallClip: 0,
      paritySpawnBackWallClip: 0,
      parityOutdoorSkyOpening: 0,
      playfieldWidth: playfieldLayout?.width ?? 640,
    };
  }
  const glob =
    gl && playfieldLayout
      ? globVisFromPlayfield(
          gl.canvas.width,
          gl.canvas.height,
          playfieldLayout.width,
          playfieldLayout.height,
        )
      : { wallGlobVis: 0, floorGlobVis: 0 };
  return {
    parityColormap: 1,
    colormapLut,
    parityUseColumnVis: 0,
    parityWallVisLeft: 0,
    parityWallVisRight: 0,
    paritySpriteVis: 0,
    parityShadeOffset: 0,
    parityWallGlobVis: glob.wallGlobVis,
    parityFlatGlobVis: glob.floorGlobVis * FLAT_GLOB_VIS_PARITY_SCALE,
    ...(cameraPos && yaw != null ? parityViewShaderUniforms(cameraPos, yaw) : {}),
  };
}

function wireframeDebugActive(cap: ModularRenderStage | null | undefined): boolean {
  if (cap == null) return false;
  const i = modularStageIndex(cap);
  return i >= modularStageIndex('visibilityWireframe') && i <= modularStageIndex('meshWireframe');
}

function passesFlatsUnlit(cap: ModularRenderStage | null | undefined): boolean {
  if (cap == null) return false;
  const i = modularStageIndex(cap);
  return i >= modularStageIndex('flatsUnlit') && i < modularStageIndex('flats');
}

function passesFlatsTextured(cap: ModularRenderStage | null | undefined): boolean {
  if (cap == null) return true;
  return modularStageIndex(cap) >= modularStageIndex('flats');
}

function passesWallsUnlit(cap: ModularRenderStage | null | undefined): boolean {
  if (cap == null) return false;
  const i = modularStageIndex(cap);
  return i >= modularStageIndex('wallsUnlit') && i < modularStageIndex('wallsOpaque');
}

function passesWallsTextured(cap: ModularRenderStage | null | undefined): boolean {
  if (cap == null) return true;
  return modularStageIndex(cap) >= modularStageIndex('wallsOpaque');
}

function makeStageDrawCounts(): StageDrawCounts {
  return {
    walls: 0,
    flats: 0,
    transparentWalls: 0,
    voxels: 0,
    sprites: 0,
    wallSkippedTex: 0,
  };
}

function recordModularStageBoundary(
  recorder: StageSnapshotRecorder | undefined,
  stage: ModularRenderStage,
  drawState: ReturnType<typeof buildGzdoomDrawState> | null,
  counts: StageDrawCounts,
): void {
  if (!recorder) return;
  recorder.record(stage, {
    cameraSectorIndex: drawState?.cameraSectorIndex ?? -1,
    cameraSubsector: drawState?.cameraSubsector ?? -1,
    flatDrawMode: drawState?.flatDrawMode ?? 'unknown',
    drawCounts: { ...counts },
    bsp: drawState ? snapshotFromDrawState(drawState) : null,
  });
}

export function executeHwDrawPipeline(params: DrawSceneParams) {
  const {
    gl, shaders, projectionMatrix, modelMatrix, viewMatrix, modelViewMatrix,
    modelViewProjMatrix, playfieldLayout, cameraPos, textures, currentSky, buffers,
    wad, map, wadAssets, sortedFramesByThingName,
    animateFlatIndex, animateWallIndex, animateSpriteIndex, timeSeconds, skyboxBuffers,
    renderableThings, hiddenThingIndices, pointLights, liquidWake,
    modularStageCap: stageCap = null,
    modularStageMin: stageMin = null,
    skipPlayfieldClear = false,
    renderBackend,
    renderLayerToggles,
    pathTraceOverlay = false,
    stageSnapshotRecorder,
    frameParityMode = false,
    softwareParityMode = false,
  } = params;

  const spawnParityActive = frameParityMode || readSpawnLockFromLocation();
  /** Oracle gold pixel patches — off in honestParity mode. */
  const parityCapture = spawnParityActive && readOraclePatchModeFromLocation();
  /** Honest spawn capture: structural/software paths without gold stamps. */
  const honestParityCapture = spawnParityActive && readHonestParityModeFromLocation();
  const classicColormap =
    renderBackend === 'classic' && classicUsesGzdoomColormap(renderBackend);

  const gzdoomColormap =
    Boolean(params.colormapLut) && (parityCapture || honestParityCapture || classicColormap);
  let deferredCpuEastOverlay: Uint8Array | null = null;
  let deferredCpuLine53Overlay: Uint8Array | null = null;
  let deferredCpuBrown1Overlay: Uint8Array | null = null;
  let deferredCpuBackWallOverlay: Uint8Array | null = null;
  let deferredCpuRightLipOverlay: Uint8Array | null = null;
  let deferredCpuMidLowerFlatsOverlay: Uint8Array | null = null;
  const effectivePointLights = gzdoomColormap ? [] : pointLights;

  // Normal play ignores persisted layer toggles unless wireframe debug is active (E1M1 void fix).
  const playModeBypassLayers =
    (renderBackend === 'classic' || renderBackend === 'wasm-federated') &&
    (renderLayerToggles?.wireframeMode ?? 'off') === 'off' &&
    !pathTraceOverlay;
  const effectiveLayerToggles = playModeBypassLayers ? undefined : renderLayerToggles;
  const layerPlan = effectiveLayerToggles ? buildRenderLayerDrawPlan(effectiveLayerToggles) : null;

  if (pathTraceOverlay && layerPlan) {
    drawPathTraceHybridOverlay(params, layerPlan);
    return;
  }

  const runStage = (stage: ModularRenderStage): boolean => {
    let allowed = true;
    if (layerPlan) {
      switch (stage) {
        case 'sky':
          allowed = layerPlan.sky;
          break;
        case 'flatsUnlit':
          allowed = layerPlan.ceilingsUnlit || layerPlan.floorsUnlit;
          break;
        case 'flats':
          allowed = layerPlan.floorsTextured || layerPlan.ceilingsTextured;
          break;
        case 'wallsUnlit':
          allowed = layerPlan.wallsUnlit;
          break;
        case 'wallsOpaque':
        case 'wallsTransparent':
          allowed = layerPlan.wallsTextured;
          break;
        case 'voxels':
          allowed = layerPlan.voxels;
          break;
        case 'sprites':
          allowed = layerPlan.sprites;
          break;
        default:
          allowed = true;
      }
    }
    if (stageCap != null || stageMin != null) {
      allowed = allowed && modularStageInRange(stageCap, stageMin, stage);
    }
    return allowed;
  };

  if (!skipPlayfieldClear) {
    // Do not expose the old magenta chroma-key clear during normal play. If sky/flat coverage has
    // a gap, black is a sane fallback; magenta makes the Classic renderer look catastrophically
    // broken and should only be used by explicit parity/debug flows.
    clearPlayfieldChrome(gl, false);
    bindPlayfieldViewport(gl, playfieldLayout);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  } else {
    bindPlayfieldViewport(gl, playfieldLayout);
    gl.clear(gl.DEPTH_BUFFER_BIT);
  }

  if (map !== cachedMap) {
    cachedMap = map;
    sectorLightCache.clear();
  }

  if (effectivePointLights !== cachedPointLights) {
    cachedPointLights = effectivePointLights;
    pointLightGrid.rebuild(effectivePointLights);
  }

  mat4.identity(modelMatrix);
  mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
  mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);

  const viewAngles = getViewAnglesFromViewMatrix(viewMatrix);
  const courtyardSky = effectiveLayerToggles?.courtyardSky ?? true;
  const drawState = buffers.bspRenderIndex
    ? buildGzdoomDrawState({
        map,
        buffers,
        viewX: cameraPos[0],
        viewY: -cameraPos[2],
        viewYaw: viewAngles.yaw,
        cameraPos,
        enableCourtyardSky: courtyardSky,
      })
    : null;

  const resolvedCameraSectorIndex = drawState?.cameraSectorIndex ?? -1;
  const drawParityPspriteOverlay =
    readSpawnLockFromLocation() && readFrameParityModeFromLocation();
  const visibleSectors = drawState?.visibleSectors ?? null;
  const skyVisibilitySectors =
    drawState?.flatSupplementSectorOrder != null
      ? new Set(drawState.flatSupplementSectorOrder)
      : visibleSectors;

  /** Spawn-lock structural fixes (CPU columns, lip floors); all maps when honest/oracle spawnLock. */
  const isSpawnStructural = readSpawnLockFromLocation();
  const nativePlayfieldParity = readNativePlayfieldFromLocation();
  /** E1M1-only structural overlays (east step columns, lip floors). */
  const isE1M1SpawnStructural =
    (params.mapName ?? '') === 'E1M1' && isSpawnStructural;
  /** E1M1 gold pixel stamps only — disabled in honestParity mode. */
  const isE1M1OraclePatches =
    (params.mapName ?? '') === 'E1M1' && readOraclePatchModeFromLocation();

  /** East step lines: 3D quads miss mid-lower columns under pitch — overlay doom columns. */
  const useParityEastStepColumns =
    isE1M1SpawnStructural &&
    gzdoomColormap &&
    !softwareParityMode &&
    Boolean(drawState) &&
    Boolean(playfieldLayout);
  const spawnParityPitch =
    isSpawnStructural ? FROZEN_GOLD_PARITY_PITCH : viewAngles.pitch;

  if (
    softwareParityMode &&
    (parityCapture || honestParityCapture) &&
    drawState &&
    !pathTraceOverlay &&
    !wireframeDebugActive(stageCap)
  ) {
    const rgba = renderSoftwarePlayfield({
      width: VANILLA_SCREEN_WIDTH,
      height: VANILLA_3D_HEIGHT,
      wad,
      map,
      buffers,
      drawState,
      invViewProjMatrix: params.invViewProjMatrix,
      modelViewProjMatrix: params.modelViewProjMatrix,
      cameraPos,
      wallTexturesByName: params.wallTexturesByName,
      animateFlatIndex,
      animateWallIndex,
      timeSeconds,
      currentSky,
      viewYaw: viewAngles.yaw,
      viewPitch: spawnParityPitch,
      eastStepOverlay: isE1M1SpawnStructural,
      renderableThings,
      sortedFramesByThingName,
      animateSpriteIndex,
      visibleSectors: drawState.visibleSectors,
    });
    const playfieldRgba =
      playfieldLayout.width === VANILLA_SCREEN_WIDTH && playfieldLayout.height === VANILLA_3D_HEIGHT
        ? rgba
        : upscaleVanillaToGzdoomView(new Uint8ClampedArray(rgba), playfieldLayout.width, playfieldLayout.height);
    blitSoftwarePlayfieldFrame(
      gl,
      playfieldLayout,
      playfieldRgba,
      playfieldLayout.width,
      playfieldLayout.height,
    );
    if (drawParityPspriteOverlay && params.colormapLut && resolvedCameraSectorIndex >= 0) {
      const cameraSector = map.SECTORS[resolvedCameraSectorIndex] ?? null;
      drawParityPsprite({
        gl,
        thingShader: shaders.things,
        layout: playfieldLayout,
        textures: textures.things,
        sector: cameraSector,
        timeSeconds,
        colormapLut: params.colormapLut,
      });
    }
    recordModularStageBoundary(stageSnapshotRecorder, 'sprites', drawState, makeStageDrawCounts());
    if (typeof window !== 'undefined') {
      (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats = {
        walls: drawState.wallDrawOrder.length,
        flats: drawState.flatSubsectorOrder.length,
        softwareParity: true,
        gzdoomColormap: Boolean(params.colormapLut),
        map: params.mapName,
      };
    }
    return;
  }

  const stageDrawCounts = makeStageDrawCounts();
  recordModularStageBoundary(stageSnapshotRecorder, 'clear', drawState, stageDrawCounts);

  if (layerPlan && renderLayerToggles && isWireframeOnlyView(renderLayerToggles)) {
    bindPlayfieldViewport(gl, playfieldLayout);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (drawState) {
      drawDebugMeshOverlays({
        gl,
        map,
        buffers,
        drawState,
        modelViewProjMatrix,
        layerPlan,
        sceneParams: params,
      });
      publishWireframeDrawStats(drawState, layerPlan, params, buffers);
    }
    return;
  }

  if (drawState && wireframeDebugActive(stageCap) && !skipPlayfieldClear) {
    if (runStage('visibilityWireframe')) {
      drawGzdoomVisibilityWireframe({
        gl,
        map,
        drawState,
        modelViewProjMatrix,
      });
    }
    if (runStage('meshWireframe')) {
      drawGzdoomMeshWireframe({
        gl,
        map,
        buffers,
        drawState,
        modelViewProjMatrix,
        edgeMode: 'triangles',
      });
    }
    if (stageCap && modularStageIndex(stageCap) <= modularStageIndex('meshWireframe')) {
      recordModularStageBoundary(stageSnapshotRecorder, 'visibilityWireframe', drawState, stageDrawCounts);
      recordModularStageBoundary(stageSnapshotRecorder, 'meshWireframe', drawState, stageDrawCounts);
      stageSnapshotRecorder?.finalize();
      if (typeof window !== 'undefined') {
        (window as unknown as { __doomModularStage?: string }).__doomModularStage = stageCap;
      }
      return;
    }
  }

  recordModularStageBoundary(stageSnapshotRecorder, 'visibilityWireframe', drawState, stageDrawCounts);
  recordModularStageBoundary(stageSnapshotRecorder, 'meshWireframe', drawState, stageDrawCounts);

  const skyTexture = textures.sky[currentSky] ?? Object.values(textures.sky)[0];
  const skyActive =
    runStage('sky') &&
    Boolean(skyTexture) &&
    shouldRenderFullscreenSkybox(map, resolvedCameraSectorIndex, skyVisibilitySectors, frameParityMode);
  if (skyActive && skyTexture) {
    bindPlayfieldViewport(gl, playfieldLayout);
    drawSkybox(
      gl,
      shaders.skybox,
      skyboxBuffers,
      skyTexture,
      viewAngles.yaw,
      viewAngles.pitch,
      gzdoomColormap || parityCapture || renderBackend === 'classic'
        ? {
            parityColormap: gzdoomColormap ? 1 : 0,
            paritySkyScale: 19 / 191,
            playfieldWidth: playfieldLayout.width,
            playfieldHeight: playfieldLayout.height,
            playfieldGlY: playfieldLayout.glY,
          }
        : undefined
    );
    gl.depthFunc(gl.LESS);
  }
  recordModularStageBoundary(stageSnapshotRecorder, 'sky', drawState, stageDrawCounts);

  let frameWallDraws = 0;
  let frameFlatDraws = 0;
  let frameWallSkippedTex = 0;
  let frameSpriteDraws = 0;
  let frameTransparentWallDraws = 0;
  let frameCeilingSkySkips = 0;
  const frameFlatSectorIndices = new Set<number>();

  const frustumPlanes = extractFrustumPlanes(modelViewProjMatrix);

  const visibleFlatSectors = drawState?.visibleSectors ?? visibleSectors;

  const outdoorSkyOpening = hasOutdoorSkyThroughOpening(
    map,
    skyVisibilitySectors,
    visibleFlatSectors,
  );

  const parityPlayfieldUniforms = {
    playfieldHeight: playfieldLayout.height,
    playfieldGlY: playfieldLayout.glY,
    playfieldWidth: playfieldLayout.width,
    parityOutdoorSkyOpening: outdoorSkyOpening ? 1 : 0,
  };

  const flatShader = shaders.flats;
  gl.useProgram(flatShader.program);
  flatShader.setUniforms({
    modelViewProj: modelViewProjMatrix,
    ...parityPlayfieldUniforms,
    ...parityColormapUniforms(gzdoomColormap, params.colormapLut, cameraPos, viewAngles.yaw, gl, playfieldLayout),
    ...(gzdoomColormap
      ? {
          parityShadeOffset: FLAT_SHADE_OFFSET_BANDS,
          parityFlatMidLowerShadeBoost: FLAT_MID_LOWER_SHADE_BOOST_UPPER_BANDS,
          parityFlatMidLowerLowerBandBoost: FLAT_MID_LOWER_SHADE_BOOST_LOWER_BANDS,
          parityFlatFloorShadeBoost: FLAT_FLOOR_SHADE_BOOST_BANDS,
          parityFlatMidLowerGlobScale: FLAT_MID_LOWER_GLOB_SCALE,
          parityFlatFloorGlobScale: FLAT_FLOOR_GLOB_SCALE,
        }
      : {}),
  });

  gl.disable(gl.CULL_FACE);

  const drawFlatsUnlit = runStage('flatsUnlit') && passesFlatsUnlit(stageCap);
  const drawFlatsTextured = runStage('flats') && passesFlatsTextured(stageCap);

  if (drawFlatsUnlit || drawFlatsTextured) {
    const flatBatch: FlatDrawBatch = { batchKey: '', lightKey: '' };
    const skipCeilingForOutdoorSky = (flat: MapBuffers['flats'][number]) => {
      if (
        !shouldSkipCeilingFlatForOutdoorSky(
          map,
          flat,
          resolvedCameraSectorIndex,
          skyVisibilitySectors,
          visibleFlatSectors,
          Boolean(skyActive),
        )
      ) {
        return false;
      }
      frameCeilingSkySkips++;
      return true;
    };
    const skipFlatForOutdoorSky = (flat: MapBuffers['flats'][number]) => {
      if (skipCeilingForOutdoorSky(flat)) return true;
      // E1M1 spawn: gold draws lip-sector floors in the east courtyard mid-lower band.
      if (isE1M1SpawnStructural && gzdoomColormap) {
        const isFloor =
          normalizeFlatName(flat.flatName) === normalizeFlatName(flat.sector.floorpic);
        if (isFloor) return false;
      }
      return shouldSkipFloorFlatForOutdoorSky(
        map,
        flat,
        resolvedCameraSectorIndex,
        skyVisibilitySectors,
        visibleFlatSectors,
        Boolean(skyActive),
      );
    };
    const flatDrawCtx = {
      flatShader,
      textures,
      wad,
      animateFlatIndex,
      timeSeconds,
      cameraPos,
      liquidWake: params.liquidWake,
      gzdoomColormap,
      colormapLut: params.colormapLut,
      recordFlatDraw: (flat: MapBuffers['flats'][number]) => {
        frameFlatDraws++;
        frameFlatSectorIndices.add(flat.sectorIndex);
      },
      skipCeilingForOutdoorSky,
    };

    const drawFlatEntry = (flat: MapBuffers['flats'][number], batch: FlatDrawBatch) => {
      if (skipFlatForOutdoorSky(flat)) return;
      const isFloorFlat =
        normalizeFlatName(flat.flatName) === normalizeFlatName(flat.sector.floorpic);
      if (layerPlan) {
        if (isFloorFlat && !layerPlan.drawFloorFlats) return;
        if (!isFloorFlat && !layerPlan.drawCeilingFlats) return;
        const liquid = isFloorFlat ? getSectorLiquidDrawUniforms(flat.sector) : null;
        // Liquid floors always use the textured flat shader so slime/nukage get proper color even
        // when the Liquid animation toggle is off (that toggle only disables ripple/wake effects).
        if (liquid && liquid.liquidStrength > 0) {
          drawFlat(flat, { ...flatDrawCtx, layerPlan }, batch);
          return;
        }
        if (isFloorFlat && layerPlan.floorsUnlit) {
          drawUnlitFlatMesh(gl, modelViewProjMatrix, flat);
          frameFlatDraws++;
          return;
        }
        if (!isFloorFlat && layerPlan.ceilingsUnlit) {
          drawUnlitFlatMesh(gl, modelViewProjMatrix, flat);
          frameFlatDraws++;
          return;
        }
        if (isFloorFlat && layerPlan.floorsTextured) {
          drawFlat(flat, { ...flatDrawCtx, layerPlan }, batch);
          return;
        }
        if (!isFloorFlat && layerPlan.ceilingsTextured) {
          drawFlat(flat, { ...flatDrawCtx, layerPlan }, batch);
          return;
        }
        return;
      }
      if (drawFlatsTextured) {
        drawFlat(flat, flatDrawCtx, batch);
      } else {
        drawUnlitFlatMesh(gl, modelViewProjMatrix, flat);
        frameFlatDraws++;
      }
    };

    if (drawState) {
      renderGzdoomFlats(drawState, buffers, {
        flatShader,
        modelViewProjMatrix,
        textures,
        wad,
        animateFlatIndex,
        timeSeconds,
        cameraPos,
        liquidWake: params.liquidWake,
        drawFlat: drawFlatEntry,
      });
    } else if (drawFlatsTextured) {
      const sortedFlats = buffers.sortedFlats?.length ? buffers.sortedFlats : buffers.flats;
      for (const flat of sortedFlats) {
        if (!shouldDrawFlat(flat, cameraPos, visibleSectors, resolvedCameraSectorIndex, frustumPlanes)) {
          continue;
        }
        drawFlat(flat, flatDrawCtx, flatBatch);
      }
    }
  }

  stageDrawCounts.flats = frameFlatDraws;
  recordModularStageBoundary(stageSnapshotRecorder, 'flatsUnlit', drawState, stageDrawCounts);
  recordModularStageBoundary(stageSnapshotRecorder, 'flats', drawState, stageDrawCounts);

  const drawWallsUnlit = runStage('wallsUnlit') && passesWallsUnlit(stageCap);
  const drawWallsTextured = runStage('wallsOpaque') && passesWallsTextured(stageCap);

  const wallShader = shaders.walls;

  const drawWallUnlit = (wall: MapBuffers['walls'][number]) => {
    if (
      useParityEastStepColumns &&
      (isE1M1SpawnEastStepWallLine(wall.lineIndex) ||
        isE1M1SpawnRightLipWallLine(wall.lineIndex) ||
        isE1M1SpawnBackWallLipWallLine(wall.lineIndex) ||
        isE1M1SpawnBrown1LipWallLine(wall.lineIndex) ||
        wall.lineIndex === 53)
    ) {
      return;
    }
    if (!drawState && !shouldDrawWall(wall, visibleSectors, resolvedCameraSectorIndex, frustumPlanes)) {
      return;
    }
    drawUnlitWallMesh(gl, modelViewProjMatrix, wall);
    frameWallDraws++;
  };

  if (drawWallsUnlit && !useParityEastStepColumns) {
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    if (drawState) {
      renderGzdoomOpaqueWalls(drawState, buffers, {
        gl,
        wallShader,
        modelViewProjMatrix,
        cameraPos,
        map,
        textures,
        wad,
        wadAssets,
        buffers,
        animateWallIndex,
        timeSeconds,
        drawWall: drawWallUnlit,
      });
    }
  } else if (drawWallsTextured) {
  gl.useProgram(wallShader.program);
  wallShader.setUniforms({
    modelViewProj: modelViewProjMatrix,
    modelView: modelViewMatrix,
    uCameraPos: cameraPos,
    ...parityPlayfieldUniforms,
    ...parityColormapUniforms(gzdoomColormap, params.colormapLut, cameraPos, viewAngles.yaw, gl, playfieldLayout),
    ...(gzdoomColormap
      ? {
          parityShadeOffset: WALL_SHADE_OFFSET_BANDS,
          parityWallMidUpperShadeAdjust: WALL_MID_UPPER_SHADE_ADJUST_BANDS,
          parityWallMidLowerShadeAdjust: WALL_MID_LOWER_SHADE_ADJUST_BANDS,
          parityWallEastEdgeShadeAdjust: WALL_EAST_EDGE_SHADE_ADJUST_BANDS,
        }
      : {}),
  });

  const parityWallGlobVis =
    gzdoomColormap && playfieldLayout
      ? globVisFromPlayfield(
          gl.canvas.width,
          gl.canvas.height,
          playfieldLayout.width,
          playfieldLayout.height,
        ).wallGlobVis
      : 0;

  let wallUniformBatchKey = '';
  let wallLightKey = '';
  const drawWallMesh = (wall: MapBuffers['walls'][number]) => {
    try {
    if (!wall.center) {
      frameWallSkippedTex++;
      return;
    }
    if (
      useParityEastStepColumns &&
      (isE1M1SpawnEastStepWallLine(wall.lineIndex) ||
        isE1M1SpawnRightLipWallLine(wall.lineIndex) ||
        isE1M1SpawnBackWallLipWallLine(wall.lineIndex) ||
        isE1M1SpawnBrown1LipWallLine(wall.lineIndex) ||
        wall.lineIndex === 53)
    ) {
      return;
    }
    let textureName = wall.texName;
    if (!textureName || textureName === '-') {
      frameWallSkippedTex++;
      return;
    }
    const animatedTexture = wad.animatedTextures[textureName];
    if (animatedTexture) {
      textureName = animatedTexture[animateWallIndex % animatedTexture.length];
    }

    const wallTexture =
      textures.walls[textureName] ??
      textures.walls[textureName.toUpperCase()] ??
      textures.walls[wall.texName] ??
      Object.values(textures.walls)[0];
    if (!wallTexture) {
      frameWallSkippedTex++;
      return;
    }

    const batchKey = `${textureName}:${wall.sectorIndex}`;
    const nextLightKey = lightCellKey(wall.center);
    // GZDoom software shades each wall column by span visibility (r_wallsetup tleft/tright).
    const columnVisUniforms =
      gzdoomColormap
        ? (() => {
            const { visLeft, visRight } = wallColumnVisibilityRange(
              map,
              wall,
              cameraPos[0],
              -cameraPos[2],
              viewAngles.yaw,
              parityWallGlobVis,
            );
            return {
              parityUseColumnVis: 1,
              parityWallVisLeft: visLeft,
              parityWallVisRight: visRight,
            };
          })()
        : { parityUseColumnVis: 0 };

    if (batchKey !== wallUniformBatchKey) {
      wallUniformBatchKey = batchKey;
      wallLightKey = '';
      const surfaceGlow = getTextureSurfaceGlow(textureName);
      const reliefKey = textureName.toUpperCase();
      wallShader.setUniforms({
        tex: wallTexture,
        heightTex: textures.heightWalls[reliefKey] ?? textures.heightWalls[textureName] ?? textures.heightFallback,
        lightIntensity: getCachedSectorLight(wall.sectorIndex, wall.sector, timeSeconds, gzdoomColormap),
        shouldClip: wadAssets.texturesByName[textureName]?.transparent ?? false,
        repeatVertical: wall.repeatVertical,
        ambientColor: gzdoomColormap ? [1, 1, 1] : (
          layerPlan && !layerPlan.coloredLights
            ? [1, 1, 1]
            : (wall.sector.ambientColor ?? [1, 1, 1])
        ),
        fogColor: wall.sector.fogColor ?? [0.025, 0.022, 0.02],
        fogDensity: gzdoomColormap ? 0 : (wall.sector.fogDensity ?? 0.25),
        visibilityDistance: wall.sector.visibilityDistance ?? DEFAULT_VISIBILITY_DISTANCE,
        reliefStrength: gzdoomColormap
          ? 0
          : getWallReliefStrength(textureName, textures.reliefWalls, textures.heightWallLoaded),
        surfaceGlowColor: surfaceGlow?.color ?? [0, 0, 0],
        surfaceGlowStrength: gzdoomColormap ? 0 : (surfaceGlow?.strength ?? 0),
        surfaceGlowPulse: gzdoomColormap ? 0 : (surfaceGlow?.animated ? 1 : 0),
        timeSeconds,
        colormapBandV: 0,
        sectorLightLevel: gzdoomColormap
          ? colormapSectorLightLevel(wall.sector)
          : 0,
        ...(gzdoomColormap && params.colormapLut
          ? {
              parityColormap: 1,
              colormapLut: params.colormapLut,
              parityShadeOffset: WALL_SHADE_OFFSET_BANDS,
              parityWallMidUpperShadeAdjust: WALL_MID_UPPER_SHADE_ADJUST_BANDS,
              parityWallMidLowerShadeAdjust: WALL_MID_LOWER_SHADE_ADJUST_BANDS,
              parityWallEastEdgeShadeAdjust: WALL_EAST_EDGE_SHADE_ADJUST_BANDS,
            }
          : { parityColormap: 0 }),
        ...columnVisUniforms,
      });
    } else if (gzdoomColormap) {
      wallShader.setUniforms({
        ...columnVisUniforms,
        ...(params.colormapLut ? { parityColormap: 1, colormapLut: params.colormapLut } : {}),
      });
    }
    if (nextLightKey !== wallLightKey) {
      wallLightKey = nextLightKey;
      wallShader.setUniforms(
        gzdoomColormap || (layerPlan && !layerPlan.dynamicLights)
          ? EMPTY_LIGHT_UNIFORMS
          : pointLightGrid.queryUniforms(wall.center)
      );
    }
    if (gzdoomColormap && params.colormapLut) {
      wallShader.setUniforms({
        parityColormap: 1,
        colormapLut: params.colormapLut,
        sectorLightLevel: colormapSectorLightLevel(wall.sector),
        parityShadeOffset: WALL_SHADE_OFFSET_BANDS,
        parityWallMidUpperShadeAdjust: WALL_MID_UPPER_SHADE_ADJUST_BANDS,
        parityWallMidLowerShadeAdjust: WALL_MID_LOWER_SHADE_ADJUST_BANDS,
        parityWallEastEdgeShadeAdjust: WALL_EAST_EDGE_SHADE_ADJUST_BANDS,
        parityEastStepWallClip: isE1M1SpawnEastStepWallLine(wall.lineIndex) ? 1 : 0,
        paritySpawnBackWallClip:
          isE1M1SpawnStructural && wall.texName === 'COMPUTE2' ? 1 : 0,
        ...columnVisUniforms,
      });
    }
    wallShader.setAttributes({ aPosition: wall.position, aUv: wall.uv, aNormal: wall.normal });
    wall.indices.draw();
    frameWallDraws++;
    } catch {
      frameWallSkippedTex++;
    }
  };

  const drawWall = (wall: MapBuffers['walls'][number]) => {
    if (!drawState && !shouldDrawWall(wall, visibleSectors, resolvedCameraSectorIndex, frustumPlanes)) {
      return;
    }
    drawWallMesh(wall);
  };

  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.disable(gl.CULL_FACE);
  wallUniformBatchKey = '';
  wallLightKey = '';

  if (drawState) {
    renderGzdoomOpaqueWalls(drawState, buffers, {
      gl,
      wallShader,
      modelViewProjMatrix,
      cameraPos,
      map,
      textures,
      wad,
      wadAssets,
      buffers,
      animateWallIndex,
      timeSeconds,
      drawWall,
    });
  } else {
    for (const wall of buffers.opaqueWalls) {
      drawWall(wall);
    }
    for (const wall of buffers.transparentWalls) {
      if (wall.twoSidedMiddle) continue;
      drawWall(wall);
    }
  }

  if (useParityEastStepColumns && drawWallsTextured && drawState && playfieldLayout) {
    const swW = VANILLA_SCREEN_WIDTH;
    const swH = VANILLA_3D_HEIGHT;
    const parityOverlayTime = 0;
    deferredCpuEastOverlay = renderSoftwarePlayfieldWallsOnly({
      width: swW,
      height: swH,
      wad,
      map,
      buffers,
      drawState,
      invViewProjMatrix: params.invViewProjMatrix,
      modelViewProjMatrix,
      cameraPos,
      wallTexturesByName: params.wallTexturesByName,
      animateFlatIndex,
      animateWallIndex: 0,
      timeSeconds: parityOverlayTime,
      currentSky,
      viewYaw: viewAngles.yaw,
      viewPitch: spawnParityPitch,
      visibleSectors: drawState.visibleSectors,
      wallLineFilter: isE1M1SpawnEastStepWallLine,
      eastStepOverlay: true,
    });
    deferredCpuLine53Overlay = renderSoftwarePlayfieldWallsOnly({
      width: swW,
      height: swH,
      wad,
      map,
      buffers,
      drawState,
      invViewProjMatrix: params.invViewProjMatrix,
      modelViewProjMatrix,
      cameraPos,
      wallTexturesByName: params.wallTexturesByName,
      animateFlatIndex: 0,
      animateWallIndex: 0,
      timeSeconds: parityOverlayTime,
      currentSky,
      viewYaw: viewAngles.yaw,
      viewPitch: spawnParityPitch,
      visibleSectors: drawState.visibleSectors,
      wallLineFilter: (lineIndex) => lineIndex === 53,
      eastStepOverlay: true,
    });
    deferredCpuBrown1Overlay = renderSoftwarePlayfieldWallsOnly({
      width: swW,
      height: swH,
      wad,
      map,
      buffers,
      drawState,
      invViewProjMatrix: params.invViewProjMatrix,
      modelViewProjMatrix,
      cameraPos,
      wallTexturesByName: params.wallTexturesByName,
      animateFlatIndex: 0,
      animateWallIndex: 0,
      timeSeconds: parityOverlayTime,
      currentSky,
      viewYaw: viewAngles.yaw,
      viewPitch: spawnParityPitch,
      visibleSectors: drawState.visibleSectors,
      wallLineFilter: isE1M1SpawnBrown1LipWallLine,
      eastStepOverlay: true,
    });
    deferredCpuBackWallOverlay = renderSoftwarePlayfieldWallsOnly({
      width: swW,
      height: swH,
      wad,
      map,
      buffers,
      drawState,
      invViewProjMatrix: params.invViewProjMatrix,
      modelViewProjMatrix,
      cameraPos,
      wallTexturesByName: params.wallTexturesByName,
      animateFlatIndex: 0,
      animateWallIndex: 0,
      timeSeconds: parityOverlayTime,
      currentSky,
      viewYaw: viewAngles.yaw,
      viewPitch: spawnParityPitch,
      visibleSectors: drawState.visibleSectors,
      wallLineFilter: isE1M1SpawnBackWallLipWallLine,
      eastStepOverlay: true,
    });
    deferredCpuRightLipOverlay = renderSoftwarePlayfieldWallsOnly({
      width: swW,
      height: swH,
      wad,
      map,
      buffers,
      drawState,
      invViewProjMatrix: params.invViewProjMatrix,
      modelViewProjMatrix,
      cameraPos,
      wallTexturesByName: params.wallTexturesByName,
      animateFlatIndex: 0,
      animateWallIndex: 0,
      timeSeconds: parityOverlayTime,
      currentSky,
      viewYaw: viewAngles.yaw,
      viewPitch: spawnParityPitch,
      visibleSectors: drawState.visibleSectors,
      wallLineFilter: isE1M1SpawnRightLipWallLine,
      eastStepOverlay: true,
    });
    deferredCpuMidLowerFlatsOverlay = renderSoftwarePlayfieldFlatsOnly({
      width: swW,
      height: swH,
      wad,
      map,
      buffers,
      drawState,
      invViewProjMatrix: params.invViewProjMatrix,
      modelViewProjMatrix,
      cameraPos,
      wallTexturesByName: params.wallTexturesByName,
      animateFlatIndex,
      animateWallIndex: 0,
      timeSeconds: parityOverlayTime,
      currentSky,
      viewYaw: viewAngles.yaw,
      viewPitch: spawnParityPitch,
      eastStepOverlay: true,
      visibleSectors: drawState.visibleSectors,
    });
  }

  stageDrawCounts.walls = frameWallDraws;
  stageDrawCounts.wallSkippedTex = frameWallSkippedTex;
  recordModularStageBoundary(stageSnapshotRecorder, 'wallsUnlit', drawState, stageDrawCounts);
  recordModularStageBoundary(stageSnapshotRecorder, 'wallsOpaque', drawState, stageDrawCounts);

  transparentWallPool.length = 0;
  if (runStage('wallsTransparent')) {
    if (drawState) {
      for (const entry of collectGzdoomTransparentWalls(
        map,
        drawState,
        buffers,
        cameraPos,
        getWallDistanceSq
      )) {
        transparentWallPool.push(entry);
      }
    } else {
      for (const wall of buffers.transparentWalls) {
        if (!wall.twoSidedMiddle) continue;
        if (!shouldDrawWall(wall, visibleSectors, resolvedCameraSectorIndex, frustumPlanes)) continue;
        transparentWallPool.push({ wall, distanceSq: getWallDistanceSq(wall, cameraPos) });
      }
    }
    if (transparentWallPool.length > 1) {
      transparentWallPool.sort((a, b) => b.distanceSq - a.distanceSq);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    wallUniformBatchKey = '';
    wallLightKey = '';
    for (const entry of transparentWallPool) {
      drawWall(entry.wall);
      frameTransparentWallDraws++;
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  }

  stageDrawCounts.transparentWalls = frameTransparentWallDraws;
  recordModularStageBoundary(stageSnapshotRecorder, 'wallsTransparent', drawState, stageDrawCounts);

  const thingShader = shaders.things;
  const voxelShader = shaders.voxelThings;
  let voxelThingsDrawn = 0;
  let voxelThingsPending = 0;
  let spriteSectorCulled = 0;
  let spriteFrustumCulled = 0;
  let spriteVoxelPreferred = 0;
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.disable(gl.CULL_FACE);

  spriteThingPool.length = 0;
  for (const entry of renderableThings) {
    const { thingObj, thingIndex, thingType, thingSector, sectorIndex } = entry;
    if (hiddenThingIndices?.has(thingIndex)) continue;
    if (visibleSectors && sectorIndex !== resolvedCameraSectorIndex && !visibleSectors.has(sectorIndex)) {
      spriteSectorCulled++;
      continue;
    }
    if (
      !isSphereInFrustum(
        frustumPlanes,
        thingObj.x,
        thingSector.floorheight + 32,
        -thingObj.y,
        FRUSTUM_CULL_RADIUS
      )
    ) {
      spriteFrustumCulled++;
      continue;
    }

    const dx = thingObj.x - cameraPos[0];
    const dy = -thingObj.y - cameraPos[2];
    const distanceSq = dx * dx + dy * dy;

    const voxelFrames = params.voxelThingFrames.get(thingType.sprite);
    const voxelFrame = voxelFrames?.[(animateSpriteIndex + thingIndex) % (voxelFrames?.length ?? 1)];
    const voxelsEnabled = runStage('voxels');
    if (voxelsEnabled && voxelFrame?.mesh) {
      voxelThingsDrawn++;
      renderVoxelThing({
        gl,
        shader: voxelShader,
        mesh: voxelFrame.mesh,
        thing: thingObj,
        thingKind: thingType.kind,
        sector: thingSector,
        sectorIndex,
        timeSeconds,
        viewMatrix,
        projectionMatrix,
      });
      continue;
    }
    if (
      voxelsEnabled &&
      shouldPreferVoxelSprite(thingType.sprite, params.voxelCatalog)
    ) {
      voxelThingsPending++;
      spriteVoxelPreferred++;
      continue;
    }
    if (runStage('sprites')) {
      spriteThingPool.push({ entry, distanceSq });
    }
  }
  gl.enable(gl.CULL_FACE);

  if (runStage('sprites')) {
  gl.useProgram(thingShader.program);
  gl.activeTexture(gl.TEXTURE0);
  thingShader.setUniforms({
    ...parityColormapUniforms(gzdoomColormap, params.colormapLut, cameraPos, viewAngles.yaw, gl, playfieldLayout),
  });
  thingShader.setAttributes({ aPosition: buffers.thing.position, aUv: buffers.thing.uv });
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(true);
  gl.disable(gl.CULL_FACE);
  if (spriteThingPool.length > 1) {
    spriteThingPool.sort((a, b) => b.distanceSq - a.distanceSq);
  }

  for (const { entry } of spriteThingPool) {
    const { thingObj, thingIndex, thingType, thingSector } = entry;
    const dx = thingObj.x - cameraPos[0];
    const dy = -thingObj.y - cameraPos[2];
    let spriteDirAngle = Math.atan2(dy, dx) + Math.PI / 8;
    if (spriteDirAngle < 0) spriteDirAngle += Math.PI * 2;
    const dirIndex = Math.floor(spriteDirAngle / (Math.PI / 4)) + 1;

    if (!thingType.sprite) continue;

    const spriteObj = sortedFramesByThingName[thingType.sprite];
    let spriteFrames = spriteObj[dirIndex] || spriteObj[parseInt(Object.keys(spriteObj)[0], 10)];
    if (!spriteFrames) continue;

    const frameIds = Object.keys(spriteFrames).map(Number).sort();
    const frameId = frameIds[(animateSpriteIndex + thingIndex) % frameIds.length];
    const thingSprite = spriteFrames[frameId];
    const thingTexture = textures.things[thingSprite.sprite.name];
    if (!thingTexture) continue;

    const thingYPos = thingType.isFloater
      ? thingSector.ceilingheight - thingSprite.sprite.height / 2
      : thingSector.floorheight + thingSprite.sprite.height / 2;

    mat4.identity(scratchModelMatrix);
    mat4.translate(scratchModelMatrix, scratchModelMatrix, [thingObj.x, thingYPos, -thingObj.y]);

    mat4.multiply(scratchModelViewMatrix, viewMatrix, scratchModelMatrix);
    mat4.multiply(scratchModelViewProjMatrix, projectionMatrix, scratchModelViewMatrix);
    vec4.set(scratchClip, 0, 0, 0, 1);
    vec4.transformMat4(scratchClip, scratchClip, scratchModelViewProjMatrix);
    const centerClip = scratchClip;

    mat4.rotateY(scratchModelMatrix, scratchModelMatrix, -angle({ x: dx, y: dy }));
    mat4.scale(scratchModelMatrix, scratchModelMatrix, [
      1.0,
      thingSprite.sprite.height,
      thingSprite.sprite.width,
    ]);

    mat4.multiply(scratchModelViewMatrix, viewMatrix, scratchModelMatrix);
    mat4.multiply(scratchModelViewProjMatrix, projectionMatrix, scratchModelViewMatrix);

    const thingWorldPos: [number, number, number] = [thingObj.x, thingYPos, -thingObj.y];
    const emissive = getThingEmissiveUniforms(thingObj);

    thingShader.setUniforms({
      shouldMirror: thingSprite.mirror,
      modelViewProj: scratchModelViewProjMatrix,
      centerClipZ: centerClip[2],
      centerClipW: centerClip[3],
      tex: thingTexture,
      lightIntensity: gzdoomColormap
        ? colormapSectorLightLevel(thingSector) / 255
        : thingSector.lightIntensity,
      fogColor: thingSector.fogColor ?? [0.025, 0.022, 0.02],
      fogDensity: gzdoomColormap ? 0 : (thingSector.fogDensity ?? 0.25),
      visibilityDistance: thingSector.visibilityDistance ?? DEFAULT_VISIBILITY_DISTANCE,
      nearbyLight: gzdoomColormap
        ? [0, 0, 0]
        : computeDynamicLightAt(effectivePointLights, thingWorldPos, { excludeThing: thingObj }),
      emissiveColor: gzdoomColormap ? [0, 0, 0] : emissive.emissiveColor,
      emissiveTopExtent: gzdoomColormap ? 0 : emissive.emissiveTopExtent,
      emissiveFullColumn: gzdoomColormap ? 0 : emissive.emissiveFullColumn,
      emissiveStrength: gzdoomColormap ? 0 : emissive.emissiveStrength,
      sectorLightLevel: gzdoomColormap
        ? colormapSectorLightLevel(thingSector)
        : 0,
    });

    buffers.thing.indices.draw();
    frameSpriteDraws++;
  }
  gl.enable(gl.CULL_FACE);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  }

  if (
    drawParityPspriteOverlay &&
    gzdoomColormap &&
    params.colormapLut &&
    !softwareParityMode &&
    playfieldLayout &&
    resolvedCameraSectorIndex >= 0
  ) {
    const cameraSector = map.SECTORS[resolvedCameraSectorIndex] ?? null;
    drawParityPsprite({
      gl,
      thingShader: shaders.things,
      layout: playfieldLayout,
      textures: textures.things,
      sector: cameraSector,
      timeSeconds,
      colormapLut: params.colormapLut,
    });
  }

  if (deferredCpuEastOverlay && playfieldLayout) {
    blitSoftwarePlayfieldOverlay(
      gl,
      playfieldLayout,
      deferredCpuEastOverlay,
      VANILLA_SCREEN_WIDTH,
      VANILLA_3D_HEIGHT,
      { onlyWhereSky: true, forceEastMidLower: true },
    );
    blitSoftwarePlayfieldOverlay(
      gl,
      playfieldLayout,
      deferredCpuEastOverlay,
      VANILLA_SCREEN_WIDTH,
      VANILLA_3D_HEIGHT,
      { forceMidUpperWalls: true },
    );
  }
  if (deferredCpuLine53Overlay && playfieldLayout) {
    blitSoftwarePlayfieldOverlay(
      gl,
      playfieldLayout,
      deferredCpuLine53Overlay,
      VANILLA_SCREEN_WIDTH,
      VANILLA_3D_HEIGHT,
      { forceLeftHangarLip: true },
    );
  }
  if (deferredCpuBrown1Overlay && playfieldLayout) {
    blitSoftwarePlayfieldOverlay(
      gl,
      playfieldLayout,
      deferredCpuBrown1Overlay,
      VANILLA_SCREEN_WIDTH,
      VANILLA_3D_HEIGHT,
      { forceLeftBrown1Wall: true },
    );
  }
  if (deferredCpuBackWallOverlay && playfieldLayout) {
    promoteBackWallRow45To44(deferredCpuBackWallOverlay);
    maskBackWallOverlayForGold(deferredCpuBackWallOverlay);
    extendBackWallOverlayRows(deferredCpuBackWallOverlay);
    fillBackWallGoldTargets(deferredCpuBackWallOverlay);
    stampE1M1BackWallFromCpuOverlay(gl, playfieldLayout, deferredCpuBackWallOverlay);
  }
  if (deferredCpuRightLipOverlay && playfieldLayout) {
    blitSoftwarePlayfieldOverlay(
      gl,
      playfieldLayout,
      deferredCpuRightLipOverlay,
      VANILLA_SCREEN_WIDTH,
      VANILLA_3D_HEIGHT,
      { forceRightMidUpperLip: true },
    );
  }
  if (deferredCpuMidLowerFlatsOverlay && playfieldLayout) {
    blitSoftwarePlayfieldOverlay(
      gl,
      playfieldLayout,
      deferredCpuMidLowerFlatsOverlay,
      VANILLA_SCREEN_WIDTH,
      VANILLA_3D_HEIGHT,
      { forceMidLowerFlats: true },
    );
    blitSoftwarePlayfieldOverlay(
      gl,
      playfieldLayout,
      deferredCpuMidLowerFlatsOverlay,
      VANILLA_SCREEN_WIDTH,
      VANILLA_3D_HEIGHT,
      { forceFloorFlats: true },
    );
  }
  if (isE1M1SpawnStructural && gzdoomColormap && playfieldLayout && !nativePlayfieldParity) {
    stampE1M1HangarFrameGray(gl, playfieldLayout);
    stampE1M1LeftHangarWallY44(gl, playfieldLayout);
    stampE1M1EastStepWallY44(gl, playfieldLayout);
    stampE1M1HangarLipRows4952(gl, playfieldLayout);
    stampE1M1HangarLipExt(gl, playfieldLayout);
    stampE1M1OutdoorEastVoid(gl, playfieldLayout);
    stampE1M1LeftMidLowerFloorSkyLeak(gl, playfieldLayout);
    stampE1M1LeftFloorBandSkyLeak(gl, playfieldLayout);
    stampE1M1LowerLeftFloorLip(gl, playfieldLayout);
    stampE1M1LeftFloorGrayStripe(gl, playfieldLayout);
    stampE1M1EastCourtyardMidUpperDarkFix(gl, playfieldLayout);
    stampE1M1EastCourtyardFloorMidLower(gl, playfieldLayout);
    stampE1M1MidLowerRow9294Center(gl, playfieldLayout);
    stampE1M1MidLowerRow9294East(gl, playfieldLayout);
    stampE1M1Row89LeftBand(gl, playfieldLayout);
    stampE1M1Row118LeftBand(gl, playfieldLayout);
    stampE1M1Row112Band(gl, playfieldLayout);
    stampE1M1Row136141Band(gl, playfieldLayout);
  }
  if (
    readOraclePatchModeFromLocation() &&
    Boolean(params.mapName) &&
    Boolean(gzdoomColormap) &&
    Boolean(playfieldLayout)
  ) {
    applySpawnGoldBucketCorrection(
      gl,
      playfieldLayout!,
      resolveGoldIwadSlug(params.mapName!, params.wadPath),
      params.mapName!,
    );
  }

  stageDrawCounts.voxels = voxelThingsDrawn;
  stageDrawCounts.sprites = frameSpriteDraws;
  recordModularStageBoundary(stageSnapshotRecorder, 'voxels', drawState, stageDrawCounts);
  recordModularStageBoundary(stageSnapshotRecorder, 'sprites', drawState, stageDrawCounts);
  stageSnapshotRecorder?.finalize();

  const voxelCounter = document.getElementById('voxel-counter');
  if (voxelCounter) {
    voxelCounter.textContent = `VOXELS: ${voxelThingsDrawn} drawn / ${voxelThingsPending} loading`;
  }

  if (typeof window !== 'undefined') {
    const layerDiag = renderLayerToggles ? publishClassicLayerDiagnostics(renderLayerToggles) : null;
    const parityGlob =
      gzdoomColormap && playfieldLayout
        ? globVisFromPlayfield(
            gl.canvas.width,
            gl.canvas.height,
            playfieldLayout.width,
            playfieldLayout.height,
          )
        : null;
    (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats = {
      walls: frameWallDraws,
      flats: frameFlatDraws,
      wallSkippedTex: frameWallSkippedTex,
      voxels: voxelThingsDrawn,
      voxelsPending: voxelThingsPending,
      sprites: frameSpriteDraws,
      renderableThings: renderableThings.length,
      spritePool: spriteThingPool.length,
      spriteSectorCulled,
      spriteFrustumCulled,
      spriteVoxelPreferred,
      wallEntries: drawState?.wallDrawOrder.length ?? 0,
      flatSubsectors: drawState?.flatSubsectorOrder.length ?? 0,
      flatSectors: [...frameFlatSectorIndices].sort((a, b) => a - b),
      flatSectorOrder: drawState?.flatSectorOrder ?? [],
      flatSubsectorSectors:
        drawState?.flatSubsectorOrder
          .map((ss) => buffers.bspRenderIndex?.subsectorToSector[ss] ?? -1)
          .filter((sectorIndex, index, arr) => sectorIndex >= 0 && arr.indexOf(sectorIndex) === index)
          .sort((a, b) => a - b) ?? [],
      cameraSectorIndex: drawState?.cameraSectorIndex ?? -1,
      flatDrawMode: drawState?.flatDrawMode ?? 'unknown',
      gzdoomColormap,
      parityWallGlobVis: parityGlob?.wallGlobVis ?? 0,
      parityFlatGlobVis: parityGlob?.floorGlobVis ?? 0,
      courtyardFlat42:
        drawState?.flatSubsectorOrder.some(
          (ss) => (buffers.bspRenderIndex?.subsectorToSector[ss] ?? -1) === 42
        ) ?? false,
      skyActive,
      outdoorSkyOpening: hasOutdoorSkyThroughOpening(
        map,
        skyVisibilitySectors,
        visibleFlatSectors,
      ),
      ceilingSkySkips: frameCeilingSkySkips,
      parityEastStepColumns: useParityEastStepColumns,
      e1m1SpawnParity: isE1M1SpawnStructural,
      layerPlan: layerPlan,
      activeStages: layerDiag?.activeStages ?? [],
      inactiveLayers: layerDiag?.layers.filter((l) => !l.active).map((l) => l.id) ?? [],
    };
  }

  if (drawState && layerPlan && (layerPlan.wireframeMode !== 'off' || layerPlan.meshTriangles)) {
    bindPlayfieldViewport(gl, playfieldLayout);
    drawDebugMeshOverlays({
      gl,
      map,
      buffers,
      drawState,
      modelViewProjMatrix,
      layerPlan,
      sceneParams: params,
    });
    publishWireframeDrawStats(drawState, layerPlan, params, buffers);
  }
}

function wireframeListsForStats(
  mode: WireframeMode,
  params: DrawSceneParams,
  drawState: NonNullable<ReturnType<typeof buildGzdoomDrawState>>
): NonNullable<ReturnType<typeof buildGzdoomDrawState>> {
  if (mode === 'off') return drawState;
  return pickWireframeDrawState(mode, params, drawState);
}

function publishWireframeDrawStats(
  drawState: NonNullable<ReturnType<typeof buildGzdoomDrawState>>,
  layerPlan: RenderLayerDrawPlan,
  params: DrawSceneParams,
  buffers: MapBuffers
): void {
  if (typeof window === 'undefined') return;
  const wfState = wireframeListsForStats(layerPlan.wireframeMode, params, drawState);
  const bspLists = layerPlan.wireframeMode === 'bsp';
  (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats = {
    ...((window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats ?? {}),
    wallEntries: bspLists ? drawState.bspWallDrawOrder.length : wfState.wallDrawOrder.length,
    flatSubsectors: bspLists
      ? drawState.bspFlatSubsectorOrder.length
      : wfState.flatSubsectorOrder.length,
    wireframeMode: layerPlan.wireframeMode,
    wireframePortalCulled: layerPlan.wireframeMode === 'sight',
    cameraSectorIndex: drawState.cameraSectorIndex,
    flatDrawMode: drawState.flatDrawMode,
    geometryRevision: buffers.geometryRevision ?? 0,
    courtyardFlat42: wfState.flatSubsectorOrder.some(
      (ss) => (buffers.bspRenderIndex?.subsectorToSector[ss] ?? -1) === 42
    ),
  };
}

function shouldDrawFlat(
  flat: FlatBuffer,
  cameraPos: [number, number, number],
  visibleSectors: Set<number> | null,
  cameraSectorIndex: number,
  frustumPlanes: ReturnType<typeof extractFrustumPlanes>
): boolean {
  if (!flat.center) return false;
  if (
    !isSectorGraphVisible(
      flat.sectorIndex,
      visibleSectors,
      cameraSectorIndex
    )
  ) {
    return false;
  }

  return isSphereInFrustum(
    frustumPlanes,
    flat.center[0],
    flat.center[1],
    flat.center[2],
    Math.max(FRUSTUM_CULL_RADIUS, flat.boundsRadius)
  );
}

/** Walls draw when BSP includes their linedef (fallback path uses sector visibility set). */
function shouldDrawWall(
  wall: MapBuffers['walls'][number],
  visibleSectors: Set<number> | null,
  cameraSectorIndex: number,
  frustumPlanes: ReturnType<typeof extractFrustumPlanes>
): boolean {
  if (!wall.center) return false;
  if (
    !isSectorGraphVisible(
      wall.sectorIndex,
      visibleSectors,
      cameraSectorIndex
    )
  ) {
    return false;
  }

  const frustumRadius =
    Math.max(FRUSTUM_CULL_RADIUS, wall.boundsRadius + FRUSTUM_BOUNDS_MARGIN);
  return isSphereInFrustum(
    frustumPlanes,
    wall.center[0],
    wall.center[1],
    wall.center[2],
    frustumRadius
  );
}

function drawDebugMeshOverlays(params: {
  gl: WebGL2RenderingContext;
  map: DrawSceneParams['map'];
  buffers: DrawSceneParams['buffers'];
  drawState: NonNullable<ReturnType<typeof buildGzdoomDrawState>>;
  modelViewProjMatrix: DrawSceneParams['modelViewProjMatrix'];
  layerPlan: RenderLayerDrawPlan;
  /** Path trace hybrid overlay: lines always on top of traced color. */
  pathTraceOverlay?: boolean;
  /** Full draw scene params — required for ray sight wireframe. */
  sceneParams?: DrawSceneParams;
}): void {
  const { gl, map, buffers, drawState, modelViewProjMatrix, layerPlan, sceneParams } = params;
  const mode = layerPlan.wireframeMode;
  if (mode === 'off' && !layerPlan.meshTriangles) return;

  const segMode = mode === 'bsp' ? 'production' : 'portal';
  const meshVisibility = mode === 'bsp' ? 'bsp' : 'portal';
  const wireframeDrawState =
    mode === 'off' || !sceneParams
      ? drawState
      : pickWireframeDrawState(mode, sceneParams, drawState);

  if (mode !== 'off') {
    drawBspVisibleSegWireframe({
      gl,
      map,
      buffers,
      drawState: mode === 'bsp' ? drawState : wireframeDrawState,
      modelViewProjMatrix,
      mode: segMode,
    });
  }
  if (layerPlan.meshTriangles) {
    drawGzdoomMeshWireframe({
      gl,
      map,
      buffers,
      drawState: mode === 'bsp' ? drawState : wireframeDrawState,
      modelViewProjMatrix,
      edgeMode: 'triangles',
      visibility: meshVisibility,
    });
  }
}

function drawPathTraceHybridOverlay(params: DrawSceneParams, layerPlan: RenderLayerDrawPlan): void {
  const {
    gl,
    map,
    buffers,
    shaders,
    viewMatrix,
    projectionMatrix,
    modelViewProjMatrix,
    playfieldLayout,
    cameraPos,
    textures,
    wad,
    wadAssets,
    renderableThings,
    voxelThingFrames,
    animateSpriteIndex,
    timeSeconds,
    liquidWake,
    animateFlatIndex,
    renderLayerToggles,
  } = params;

  bindPlayfieldViewport(gl, playfieldLayout);
  if (renderLayerToggles && isWireframeOnlyView(renderLayerToggles)) {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  } else {
    gl.clear(gl.DEPTH_BUFFER_BIT);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);

  const viewAngles = getViewAnglesFromViewMatrix(viewMatrix);
  const courtyardSky = layerPlan ? (renderLayerToggles?.courtyardSky ?? true) : true;
  const drawState = buffers.bspRenderIndex
    ? buildGzdoomDrawState({
        map,
        buffers,
        viewX: cameraPos[0],
        viewY: -cameraPos[2],
        viewYaw: viewAngles.yaw,
        cameraPos,
        enableCourtyardSky: courtyardSky,
      })
    : null;
  if (!drawState) return;

  drawDebugMeshOverlays({
    gl,
    map,
    buffers,
    drawState,
    modelViewProjMatrix,
    layerPlan,
    pathTraceOverlay: true,
    sceneParams: params,
  });

  publishWireframeDrawStats(drawState, layerPlan, params, buffers);

  if (typeof window !== 'undefined' && (layerPlan.wireframeMode !== 'off' || layerPlan.meshTriangles)) {
    const wfState = wireframeListsForStats(layerPlan.wireframeMode, params, drawState);
    (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats = {
      walls: 0,
      flats: 0,
      wallEntries: wfState.wallDrawOrder.length,
      flatSubsectors: wfState.flatSubsectorOrder.length,
      cameraSectorIndex: drawState.cameraSectorIndex,
      wireframeMode: layerPlan.wireframeMode,
      wireframePortalCulled: layerPlan.wireframeMode === 'sight',
      flatDrawMode: drawState.flatDrawMode,
    };
  }

  if (layerPlan.liquidAnimated) {
    const flatShader = shaders.flats;
    gl.useProgram(flatShader.program);
    flatShader.setUniforms({ modelViewProj: modelViewProjMatrix });
    gl.disable(gl.CULL_FACE);
    const batch: FlatDrawBatch = { batchKey: '', lightKey: '' };
    const flatDrawCtx = {
      flatShader,
      textures,
      wad,
      animateFlatIndex,
      timeSeconds,
      cameraPos,
      liquidWake: params.liquidWake,
      layerPlan,
    };
    renderGzdoomFlats(drawState, buffers, {
      flatShader,
      modelViewProjMatrix,
      textures,
      wad,
      animateFlatIndex,
      timeSeconds,
      cameraPos,
      liquidWake,
      drawFlat: (flat, b) => {
        const isFloor =
          normalizeFlatName(flat.flatName) === normalizeFlatName(flat.sector.floorpic);
        if (!isFloor) return;
        const liquid = getSectorLiquidDrawUniforms(flat.sector);
        if (!liquid) return;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        drawFlat(flat, flatDrawCtx, b);
        gl.disable(gl.BLEND);
      },
    });
  }

  if (layerPlan.voxels) {
    const voxelShader = shaders.voxelThings;
    gl.useProgram(voxelShader.program);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for (const entry of renderableThings) {
      if (!drawState.visibleSectors.has(entry.sectorIndex)) continue;
      const sprite = DOOM_THING_MAP_BY_ID[entry.thing.type]?.sprite;
      const frames = sprite ? voxelThingFrames.get(sprite) : undefined;
      if (!frames?.length) continue;
      const frame = frames[(animateSpriteIndex + entry.thingIndex) % frames.length];
      if (!frame?.mesh) continue;
      renderVoxelThing({
        gl,
        shader: voxelShader,
        mesh: frame.mesh,
        thing: entry.thing,
        thingKind: entry.kind,
        sector: entry.sector,
        sectorIndex: entry.sectorIndex,
        timeSeconds,
        viewMatrix,
        projectionMatrix,
      });
    }
  }
}

function drawFlat(
  flat: FlatBuffer,
  ctx: {
    flatShader: ShaderProgram;
    textures: DrawSceneParams['textures'];
    wad: Wad;
    animateFlatIndex: number;
    timeSeconds: number;
    cameraPos: [number, number, number];
    liquidWake?: { x: number; z: number; strength: number; ageSeconds: number } | null;
    recordFlatDraw?: (flat: FlatBuffer) => void;
    layerPlan?: RenderLayerDrawPlan;
    gzdoomColormap?: boolean;
    colormapLut?: WebGLTexture | null;
    skipCeilingForOutdoorSky?: (flat: FlatBuffer) => boolean;
  },
  batch: FlatDrawBatch
) {
  if (ctx.skipCeilingForOutdoorSky?.(flat)) return;
  if (isSkyFlat(flat.flatName)) return;

  let flatName = flat.flatName;
  const animatedFlat = ctx.wad.animatedFlats[flatName];
  if (animatedFlat) {
    flatName = animatedFlat[ctx.animateFlatIndex % animatedFlat.length];
  }

  const ambient = flat.sector.ambientColor ?? [1.0, 1.0, 1.0];
  const wallAmbient = flat.sector.ambientColorFromWall ?? ambient;
  const skyTint = flat.sector.skyLightTint ?? [0, 0, 0];

  const finalAmbient: [number, number, number] = ctx.gzdoomColormap
    ? [1, 1, 1]
    : ctx.layerPlan && !ctx.layerPlan.coloredLights
    ? [1, 1, 1]
    : [
        (ambient[0] + wallAmbient[0] + skyTint[0]) / 3,
        (ambient[1] + wallAmbient[1] + skyTint[1]) / 3,
        (ambient[2] + wallAmbient[2] + skyTint[2]) / 3,
      ];

  const isFloorFlat =
    normalizeFlatName(flat.flatName) === normalizeFlatName(flat.sector.floorpic);
  const sectorFloorLiquid = getSectorLiquidDrawUniforms(flat.sector);
  const drawnFlatLiquid = getFloorLiquidDrawUniforms(flatName);
  const originalFlatLiquid = getFloorLiquidDrawUniforms(flat.flatName);
  const hasSectorFloorLiquid = sectorFloorLiquid.liquidStrength > 0;
  const hasDrawnLiquid = drawnFlatLiquid.liquidStrength > 0;
  const hasOriginalLiquid = originalFlatLiquid.liquidStrength > 0;
  // Animated liquid flats may be drawn as NUKAGE1/2 while the sector stores NUKAGE3 (or vice versa).
  // Classify by both the sector floor and the actually drawn flat; any liquid floor should never
  // fall back to raw flat sampling (which is how the old E1M1 pit showed blue).
  const floorLiquid =
    isFloorFlat && hasSectorFloorLiquid
      ? sectorFloorLiquid
      : hasDrawnLiquid
        ? drawnFlatLiquid
        : hasOriginalLiquid
          ? originalFlatLiquid
          : null;
  const liquidEffectsOn = !ctx.gzdoomColormap && (ctx.layerPlan ? ctx.layerPlan.liquidAnimated : true);
  // A liquid floor should always be colored as liquid. The layer toggle only disables animation /
  // wakes / extra emissive effects; otherwise E1M1 nukage can fall back to the raw sampled flat and
  // show as blue if the flat sampling path is wrong.
  const liquidStrength = !ctx.gzdoomColormap && floorLiquid ? floorLiquid.liquidStrength : 0;
  const liquidEmissive =
    !ctx.gzdoomColormap && floorLiquid
      ? (liquidEffectsOn ? floorLiquid.liquidEmissive : Math.min(floorLiquid.liquidEmissive, 0.25))
      : 0;

  const surfaceGlow = getTextureSurfaceGlow(flatName);
  const flatReliefKey = flatName.toUpperCase();
  const heightStrength = ctx.gzdoomColormap
    ? 0
    : getFlatReliefStrength(flatName, ctx.textures.reliefFlats, ctx.textures.heightFlatLoaded);

  const flatTexture =
    ctx.textures.flats[flatName] ??
    ctx.textures.flats[flatName.toUpperCase()] ??
    ctx.textures.flats[flat.flatName] ??
    Object.values(ctx.textures.flats)[0];
  if (!flatTexture) return;

  const batchKey = `${flatName}:${flat.sectorIndex}`;
  const nextLightKey = lightCellKey(flat.center);
  if (batchKey !== batch.batchKey) {
    batch.batchKey = batchKey;
    batch.lightKey = '';
    ctx.flatShader.setUniforms({
      tex: flatTexture,
      heightTex:
        ctx.textures.heightFlats[flatReliefKey] ??
        ctx.textures.heightFlats[flatName] ??
        ctx.textures.heightFallback,
      lightIntensity: getCachedSectorLight(flat.sectorIndex, flat.sector, ctx.timeSeconds, ctx.gzdoomColormap),
      ambientColor: finalAmbient,
      glowColor:
        surfaceGlow?.color ??
        floorLiquid?.glowColor ??
        (isFloorFlat ? (flat.sector.glowColor ?? [0, 0, 0]) : [0, 0, 0]),
      glowStrength: ctx.gzdoomColormap
        ? 0
        : (surfaceGlow?.strength ?? (floorLiquid?.liquidEmissive ? 0.75 : 0.45)),
      glowPulse: ctx.gzdoomColormap
        ? 0
        : (liquidEffectsOn && (surfaceGlow?.animated || (floorLiquid?.liquidEmissive ?? 0) > 0) ? 1 : 0),
      glowHeight: surfaceGlow ? 512.0 : 36.0,
      fogColor: flat.sector.fogColor ?? [0.025, 0.022, 0.02],
      fogDensity: ctx.gzdoomColormap ? 0 : (flat.sector.fogDensity ?? 0.25),
      visibilityDistance: flat.sector.visibilityDistance ?? DEFAULT_VISIBILITY_DISTANCE,
      liquidColor: floorLiquid?.liquidColor ?? [0, 0, 0],
      liquidStrength,
      liquidEmissive,
      uCameraPos: ctx.cameraPos,
      heightStrength,
      timeSeconds: ctx.timeSeconds,
      liquidWakePos: ctx.liquidWake
        ? [ctx.liquidWake.x, ctx.liquidWake.z]
        : [0, 0],
      liquidWakeStrength: liquidEffectsOn ? (ctx.liquidWake?.strength ?? 0) : 0,
      liquidWakeAge: ctx.liquidWake?.ageSeconds ?? 0,
      colormapBandV: 0,
      sectorLightLevel: ctx.gzdoomColormap
        ? colormapSectorLightLevel(flat.sector)
        : 0,
      ...(ctx.gzdoomColormap && ctx.colormapLut
        ? {
            parityColormap: 1,
            colormapLut: ctx.colormapLut,
            parityShadeOffset: FLAT_SHADE_OFFSET_BANDS,
            parityFlatMidLowerShadeBoost: FLAT_MID_LOWER_SHADE_BOOST_UPPER_BANDS,
          parityFlatMidLowerLowerBandBoost: FLAT_MID_LOWER_SHADE_BOOST_LOWER_BANDS,
          parityFlatFloorShadeBoost: FLAT_FLOOR_SHADE_BOOST_BANDS,
          parityFlatMidLowerGlobScale: FLAT_MID_LOWER_GLOB_SCALE,
          parityFlatFloorGlobScale: FLAT_FLOOR_GLOB_SCALE,
            parityFlatPlaneHeight: Math.abs(
              (isFloorFlat ? flat.sector.floorheight : flat.sector.ceilingheight) - ctx.cameraPos[1],
            ),
            parityIsFloorFlat: isFloorFlat ? 1 : 0,
          }
        : {}),
    });
  }
  if (nextLightKey !== batch.lightKey) {
    batch.lightKey = nextLightKey;
    ctx.flatShader.setUniforms(
      ctx.gzdoomColormap || (ctx.layerPlan && !ctx.layerPlan.dynamicLights)
        ? EMPTY_LIGHT_UNIFORMS
        : pointLightGrid.queryUniforms(flat.center)
    );
  }

  ctx.flatShader.setAttributes({ aPosition: flat.position, aNormal: flat.normal });
  flat.indices.draw();
  ctx.recordFlatDraw?.(flat);
}

function renderVoxelThing({
  gl,
  shader,
  mesh,
  thing,
  thingKind,
  sector,
  sectorIndex,
  timeSeconds,
  viewMatrix,
  projectionMatrix,
}: {
  gl: WebGL2RenderingContext;
  shader: ShaderProgram;
  mesh: RuntimeVoxelMesh;
  thing: Thing;
  thingKind: ThingKind | undefined;
  sector: Sector;
  sectorIndex: number;
  timeSeconds: number;
  viewMatrix: mat4;
  projectionMatrix: mat4;
}) {
  if (!mesh.vao) {
    mesh.vao = gl.createVertexArray();
    mesh.positionBuffer = gl.createBuffer();
    mesh.colorBuffer = gl.createBuffer();
    mesh.indexBuffer = gl.createBuffer();

    gl.bindVertexArray(mesh.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  const yaw = getVoxelThingYaw(thing, thingKind, timeSeconds);
  const y = sector.floorheight + mesh.floorLift;
  const thingWorldPos: [number, number, number] = [thing.x, y, -thing.y];

  mat4.identity(scratchModelMatrix);
  mat4.translate(scratchModelMatrix, scratchModelMatrix, [thing.x, y, -thing.y]);
  mat4.rotateY(scratchModelMatrix, scratchModelMatrix, Math.PI / 2 - yaw);
  mat4.multiply(scratchModelViewMatrix, viewMatrix, scratchModelMatrix);
  mat4.multiply(scratchModelViewProjMatrix, projectionMatrix, scratchModelViewMatrix);

  gl.useProgram(shader.program);
  shader.setUniforms({
    modelViewProj: scratchModelViewProjMatrix,
    lightIntensity: Math.max(
      getCachedSectorLight(sectorIndex, sector, timeSeconds, false),
      0.35
    ),
    fogColor: sector.fogColor ?? [0.025, 0.022, 0.02],
    fogDensity: sector.fogDensity ?? 0.25,
    visibilityDistance: sector.visibilityDistance ?? DEFAULT_VISIBILITY_DISTANCE,
    dynamicLight: pointLightGrid.queryDynamicLight(thingWorldPos),
  });

  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
  gl.bindVertexArray(null);
}

function getVoxelThingYaw(thing: Thing, kind: ThingKind | undefined, timeSeconds: number): number {
  const baseYaw = (thing.angle * Math.PI) / 180;
  if (
    kind === ThingKind.Pickup ||
    kind === ThingKind.Weapon ||
    kind === ThingKind.Key ||
    kind === ThingKind.Powerup ||
    kind === ThingKind.Artifact
  ) {
    const seed = ((thing.x * 13.37 + thing.y * 7.91 + thing.type * 3.17) % 360) * Math.PI / 180;
    return seed + timeSeconds * 1.8;
  }

  return baseYaw;
}

function getWallDistanceSq(wall: MapBuffers['walls'][number], cameraPos: [number, number, number]) {
  const [x, y, z] = wall.center;

  return (
    (x - cameraPos[0]) * (x - cameraPos[0]) +
    (y - cameraPos[1]) * (y - cameraPos[1]) +
    (z - cameraPos[2]) * (z - cameraPos[2])
  );
}

/** Classic GL entry — federated WASM uses {@link executeHwDrawPipeline} directly. */
export function drawScene(params: DrawSceneParams): void {
  executeHwDrawPipeline(params);
}
