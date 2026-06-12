import { mat4, vec4 } from 'gl-matrix';
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
import { RuntimeVoxelMesh, VoxelThingFrameMap } from './voxelThingMeshes';
import { hasVoxelDefinitionForSprite } from '@/wad/voxels/voxelCatalog';
import { RenderableThing } from './renderableThings';
import {
  buildGzdoomDrawState,
} from '@/wad/renderer/bsp/gzdoomDrawState';
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
import { shouldRenderFullscreenSkybox } from '@/wad/renderer/utils/sectorSkyVisibility';
import { getEffectiveSectorLightLevel } from '@/wad/renderer/renderGame/sectorDynamicLight';
import {
  DEFAULT_VISIBILITY_DISTANCE,
  FRUSTUM_BOUNDS_MARGIN,
  FRUSTUM_CULL_RADIUS,
  VISIBILITY_DISTANCE_MARGIN,
} from '@/wad/constants/RenderInfo';
import { extractFrustumPlanes, isSphereInFrustum } from '@/wad/renderer/utils/frustumCull';
import { getFlatReliefStrength, getWallReliefStrength } from '@/wad/renderer/renderGame/heightTextures';
import { computeDynamicLightAt } from '@/wad/renderer/utils/precomputedLights';
import {
  getFloorLiquidDrawUniforms,
  getTextureSurfaceGlow,
  getThingEmissiveUniforms,
  normalizeFlatName,
  type PointLight,
} from '@/wad/renderer/renderGame/sectorLighting';
import { ThingKind } from '@/wad/constants/ThingTypes';
import { Thing } from '@/wad/interfaces/Thing';
import { Sector } from '@/wad/interfaces/Sector';

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
  timeSeconds: number
): number {
  const bucket = (timeSeconds * LIGHT_BUCKET_HZ) | 0;
  const key = sectorIndex * 10000 + bucket;
  let level = sectorLightCache.get(key);
  if (level === undefined) {
    level = getEffectiveSectorLightLevel(sector, timeSeconds) / 255;
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
  voxelThingFrames: VoxelThingFrameMap;
  pointLights: PointLight[];
  /** World XZ of a recent liquid entry for surface ripples (optional). */
  liquidWake?: { x: number; z: number; strength: number; ageSeconds: number } | null;
}

export function drawScene(params: DrawSceneParams) {
  const {
    gl, shaders, projectionMatrix, modelMatrix, viewMatrix, modelViewMatrix,
    modelViewProjMatrix, cameraPos, textures, currentSky, buffers,
    wad, map, wadAssets, sortedFramesByThingName,
    animateFlatIndex, animateWallIndex, animateSpriteIndex, timeSeconds, skyboxBuffers,
    renderableThings, pointLights, liquidWake,
  } = params;

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (map !== cachedMap) {
    cachedMap = map;
    sectorLightCache.clear();
  }

  if (pointLights !== cachedPointLights) {
    cachedPointLights = pointLights;
    pointLightGrid.rebuild(pointLights);
  }

  mat4.identity(modelMatrix);
  mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
  mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);

  const viewAngles = getViewAnglesFromViewMatrix(viewMatrix);
  const drawState = buffers.bspRenderIndex
    ? buildGzdoomDrawState({
        map,
        buffers,
        viewX: cameraPos[0],
        viewY: -cameraPos[2],
        viewYaw: viewAngles.yaw,
        cameraPos,
      })
    : null;

  const resolvedCameraSectorIndex = drawState?.cameraSectorIndex ?? -1;
  const visibleSectors = drawState?.visibleSectors ?? null;

  const skyTexture = textures.sky[currentSky] ?? Object.values(textures.sky)[0];
  if (skyTexture && shouldRenderFullscreenSkybox(map, resolvedCameraSectorIndex, visibleSectors)) {
    drawSkybox(gl, shaders.skybox, skyboxBuffers, skyTexture, viewAngles.yaw, viewAngles.pitch);
    gl.depthFunc(gl.LESS);
  }

  let frameWallDraws = 0;
  let frameFlatDraws = 0;
  let frameWallSkippedTex = 0;

  const frustumPlanes = extractFrustumPlanes(modelViewProjMatrix);

  const flatShader = shaders.flats;
  gl.useProgram(flatShader.program);
  flatShader.setUniforms({ modelViewProj: modelViewProjMatrix });

  gl.disable(gl.CULL_FACE);

  const flatBatch: FlatDrawBatch = { batchKey: '', lightKey: '' };
  const flatDrawCtx = {
    flatShader,
    textures,
    wad,
    animateFlatIndex,
    timeSeconds,
    cameraPos,
    liquidWake: params.liquidWake,
    recordFlatDraw: () => {
      frameFlatDraws++;
    },
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
      drawFlat: (flat, batch) => {
        drawFlat(flat, flatDrawCtx, batch);
      },
    });
  } else {
    const sortedFlats = buffers.sortedFlats?.length ? buffers.sortedFlats : buffers.flats;
    for (const flat of sortedFlats) {
      if (!shouldDrawFlat(flat, cameraPos, visibleSectors, resolvedCameraSectorIndex, frustumPlanes)) {
        continue;
      }
      drawFlat(flat, flatDrawCtx, flatBatch);
    }
  }

  const wallShader = shaders.walls;
  gl.useProgram(wallShader.program);
  wallShader.setUniforms({ modelViewProj: modelViewProjMatrix, uCameraPos: cameraPos });

  let wallUniformBatchKey = '';
  let wallLightKey = '';
  const drawWallMesh = (wall: MapBuffers['walls'][number]) => {
    let textureName = wall.texName;
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
    if (batchKey !== wallUniformBatchKey) {
      wallUniformBatchKey = batchKey;
      wallLightKey = '';
      const surfaceGlow = getTextureSurfaceGlow(textureName);
      const reliefKey = textureName.toUpperCase();
      wallShader.setUniforms({
        tex: wallTexture,
        heightTex: textures.heightWalls[reliefKey] ?? textures.heightWalls[textureName] ?? textures.heightFallback,
        lightIntensity: getCachedSectorLight(wall.sectorIndex, wall.sector, timeSeconds),
        shouldClip: wadAssets.texturesByName[textureName]?.transparent ?? false,
        repeatVertical: wall.repeatVertical,
        ambientColor: wall.sector.ambientColor ?? [1, 1, 1],
        fogColor: wall.sector.fogColor ?? [0.025, 0.022, 0.02],
        fogDensity: wall.sector.fogDensity ?? 0.25,
        visibilityDistance: wall.sector.visibilityDistance ?? DEFAULT_VISIBILITY_DISTANCE,
        reliefStrength: getWallReliefStrength(
          textureName,
          textures.reliefWalls,
          textures.heightWallLoaded
        ),
        surfaceGlowColor: surfaceGlow?.color ?? [0, 0, 0],
        surfaceGlowStrength: surfaceGlow?.strength ?? 0,
        surfaceGlowPulse: surfaceGlow?.animated ? 1 : 0,
        timeSeconds,
      });
    }
    if (nextLightKey !== wallLightKey) {
      wallLightKey = nextLightKey;
      wallShader.setUniforms(pointLightGrid.queryUniforms(wall.center));
    }
    wallShader.setAttributes({ aPosition: wall.position, aUv: wall.uv, aNormal: wall.normal });
    wall.indices.draw();
    frameWallDraws++;
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

  transparentWallPool.length = 0;
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
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);

  const thingShader = shaders.things;
  const voxelShader = shaders.voxelThings;
  let voxelThingsDrawn = 0;
  let voxelThingsPending = 0;
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.disable(gl.CULL_FACE);

  spriteThingPool.length = 0;
  for (const entry of renderableThings) {
    const { thingObj, thingIndex, thingType, thingSector, sectorIndex } = entry;
    if (
      !isSphereInFrustum(
        frustumPlanes,
        thingObj.x,
        thingSector.floorheight + 32,
        -thingObj.y,
        FRUSTUM_CULL_RADIUS
      )
    ) {
      continue;
    }

    const dx = thingObj.x - cameraPos[0];
    const dy = -thingObj.y - cameraPos[2];
    const distanceSq = dx * dx + dy * dy;

    const voxelFrames = params.voxelThingFrames.get(thingType.sprite);
    const voxelFrame = voxelFrames?.[(animateSpriteIndex + thingIndex) % (voxelFrames?.length ?? 1)];
    if (voxelFrame?.mesh) {
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
    if (hasVoxelDefinitionForSprite(thingType.sprite)) {
      voxelThingsPending++;
      continue;
    }
    spriteThingPool.push({ entry, distanceSq });
  }
  gl.enable(gl.CULL_FACE);

  gl.useProgram(thingShader.program);
  gl.activeTexture(gl.TEXTURE0);
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
      lightIntensity: thingSector.lightIntensity,
      fogColor: thingSector.fogColor ?? [0.025, 0.022, 0.02],
      fogDensity: thingSector.fogDensity ?? 0.25,
      visibilityDistance: thingSector.visibilityDistance ?? DEFAULT_VISIBILITY_DISTANCE,
      nearbyLight: computeDynamicLightAt(pointLights, thingWorldPos, { excludeThing: thingObj }),
      emissiveColor: emissive.emissiveColor,
      emissiveTopExtent: emissive.emissiveTopExtent,
      emissiveFullColumn: emissive.emissiveFullColumn,
      emissiveStrength: emissive.emissiveStrength,
    });

    buffers.thing.indices.draw();
  }
  gl.enable(gl.CULL_FACE);
  gl.depthMask(true);
  gl.disable(gl.BLEND);

  const voxelCounter = document.getElementById('voxel-counter');
  if (voxelCounter) {
    voxelCounter.textContent = `VOXELS: ${voxelThingsDrawn} drawn / ${voxelThingsPending} loading`;
  }

  if (typeof window !== 'undefined') {
    (window as unknown as { __doomDrawStats?: Record<string, number> }).__doomDrawStats = {
      walls: frameWallDraws,
      flats: frameFlatDraws,
      wallSkippedTex: frameWallSkippedTex,
      wallEntries: drawState?.wallDrawOrder.length ?? 0,
      flatSubsectors: drawState?.flatSubsectorOrder.length ?? 0,
    };
  }
}

function shouldDrawFlat(
  flat: FlatBuffer,
  cameraPos: [number, number, number],
  visibleSectors: Set<number> | null,
  cameraSectorIndex: number,
  frustumPlanes: ReturnType<typeof extractFrustumPlanes>
): boolean {
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
    recordFlatDraw?: () => void;
  },
  batch: FlatDrawBatch
) {
  let flatName = flat.flatName;
  const animatedFlat = ctx.wad.animatedFlats[flatName];
  if (animatedFlat) {
    flatName = animatedFlat[ctx.animateFlatIndex % animatedFlat.length];
  }

  const ambient = flat.sector.ambientColor ?? [1.0, 1.0, 1.0];
  const wallAmbient = flat.sector.ambientColorFromWall ?? ambient;
  const skyTint = flat.sector.skyLightTint ?? [0, 0, 0];

  const finalAmbient: [number, number, number] = [
    (ambient[0] + wallAmbient[0] + skyTint[0]) / 3,
    (ambient[1] + wallAmbient[1] + skyTint[1]) / 3,
    (ambient[2] + wallAmbient[2] + skyTint[2]) / 3,
  ];

  const isFloorFlat =
    normalizeFlatName(flat.flatName) === normalizeFlatName(flat.sector.floorpic);
  const floorLiquid = isFloorFlat ? getFloorLiquidDrawUniforms(flat.sector.floorpic) : null;

  const surfaceGlow = getTextureSurfaceGlow(flatName);
  const flatReliefKey = flatName.toUpperCase();
  const heightStrength = getFlatReliefStrength(
    flatName,
    ctx.textures.reliefFlats,
    ctx.textures.heightFlatLoaded
  );

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
      lightIntensity: getCachedSectorLight(flat.sectorIndex, flat.sector, ctx.timeSeconds),
      ambientColor: finalAmbient,
      glowColor:
        surfaceGlow?.color ??
        floorLiquid?.glowColor ??
        (isFloorFlat ? (flat.sector.glowColor ?? [0, 0, 0]) : [0, 0, 0]),
      glowStrength: surfaceGlow?.strength ?? (floorLiquid?.liquidEmissive ? 0.75 : 0.45),
      glowPulse: surfaceGlow?.animated || (floorLiquid?.liquidEmissive ?? 0) > 0 ? 1 : 0,
      glowHeight: surfaceGlow ? 512.0 : 36.0,
      fogColor: flat.sector.fogColor ?? [0.025, 0.022, 0.02],
      fogDensity: flat.sector.fogDensity ?? 0.25,
      visibilityDistance: flat.sector.visibilityDistance ?? DEFAULT_VISIBILITY_DISTANCE,
      liquidColor: floorLiquid?.liquidColor ?? [0, 0, 0],
      liquidStrength: floorLiquid?.liquidStrength ?? 0,
      liquidEmissive: floorLiquid?.liquidEmissive ?? 0,
      uCameraPos: ctx.cameraPos,
      heightStrength,
      timeSeconds: ctx.timeSeconds,
      liquidWakePos: ctx.liquidWake
        ? [ctx.liquidWake.x, ctx.liquidWake.z]
        : [0, 0],
      liquidWakeStrength: ctx.liquidWake?.strength ?? 0,
      liquidWakeAge: ctx.liquidWake?.ageSeconds ?? 0,
    });
  }
  if (nextLightKey !== batch.lightKey) {
    batch.lightKey = nextLightKey;
    ctx.flatShader.setUniforms(pointLightGrid.queryUniforms(flat.center));
  }

  ctx.flatShader.setAttributes({ aPosition: flat.position, aNormal: flat.normal });
  flat.indices.draw();
  ctx.recordFlatDraw?.();
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
      getCachedSectorLight(sectorIndex, sector, timeSeconds),
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
