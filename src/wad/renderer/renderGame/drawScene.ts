import { mat4 } from 'gl-matrix';
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
  buildPotentiallyVisibleSectors,
  findCameraSectorIndex,
  isDrawVisible,
} from '@/wad/renderer/utils/sectorVisibility';
import { getFlatReliefStrength, getWallReliefStrength } from '@/wad/renderer/renderGame/heightTextures';
import {
  computeDynamicLightAt,
  computeNearestLightUniforms,
} from '@/wad/renderer/utils/precomputedLights';
import { ThingKind } from '@/wad/constants/ThingTypes';
import { Thing } from '@/wad/interfaces/Thing';
import { Sector } from '@/wad/interfaces/Sector';

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
}

export function drawScene(params: DrawSceneParams) {
  const {
    gl, shaders, projectionMatrix, modelMatrix, viewMatrix, modelViewMatrix,
    modelViewProjMatrix, cameraPos, textures, currentSky, buffers,
    wad, map, wadAssets, sortedFramesByThingName,
    animateFlatIndex, animateWallIndex, animateSpriteIndex, timeSeconds, skyboxBuffers,
    renderableThings, pointLights,
  } = params;

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const skyAngles = getViewAnglesFromViewMatrix(viewMatrix);
  const skyTexture = textures.sky[currentSky] ?? Object.values(textures.sky)[0];
  if (skyTexture) {
    drawSkybox(gl, shaders.skybox, skyboxBuffers, skyTexture, skyAngles.yaw, skyAngles.pitch);
  }

  mat4.identity(modelMatrix);
  mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
  mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);

  const cameraSectorIndex =
    buffers.triangleHash
      ? findCameraSectorIndex(map, buffers.sectorTriangles, buffers.triangleHash, cameraPos)
      : -1;

  const visibleSectors =
    buffers.sectorVisibility
      ? buildPotentiallyVisibleSectors(
          buffers.sectorVisibility,
          map,
          cameraPos[0],
          -cameraPos[2],
          cameraSectorIndex,
          1400
        )
      : null;

  const flatShader = shaders.flats;
  gl.useProgram(flatShader.program);
  flatShader.setUniforms({ modelViewProj: modelViewProjMatrix });

  gl.disable(gl.CULL_FACE);
  const sortedFlats = buffers.sortedFlats?.length ? buffers.sortedFlats : buffers.flats;

  for (const flat of sortedFlats) {
    if (!shouldDrawFlat(flat, cameraPos, visibleSectors, cameraSectorIndex)) continue;
    drawFlat(flat, {
      flatShader,
      textures,
      wad,
      animateFlatIndex,
      timeSeconds,
      pointLights,
      cameraPos,
    });
  }
  gl.enable(gl.CULL_FACE);

  const wallShader = shaders.walls;
  gl.useProgram(wallShader.program);
  wallShader.setUniforms({ modelViewProj: modelViewProjMatrix, uCameraPos: cameraPos });

  const drawWall = (wall: MapBuffers['walls'][number]) => {
    if (!shouldDrawWall(wall, cameraPos, visibleSectors, cameraSectorIndex)) return;

    let textureName = wall.texName;
    const animatedTexture = wad.animatedTextures[textureName];
    if (animatedTexture) {
      textureName = animatedTexture[animateWallIndex % animatedTexture.length];
    }

    const surfaceGlow = getTextureSurfaceGlow(textureName);
    const reliefKey = textureName.toUpperCase();

    wallShader.setUniforms({
      tex: textures.walls[textureName],
      heightTex: textures.heightWalls[reliefKey] ?? textures.heightWalls[textureName] ?? textures.heightFallback,
      lightIntensity: wall.sector.lightIntensity,
      shouldClip: wadAssets.texturesByName[textureName].transparent,
      repeatVertical: wall.repeatVertical,
      ambientColor: wall.sector.ambientColor ?? [1, 1, 1],
      fogColor: wall.sector.fogColor ?? [0.025, 0.022, 0.02],
      fogDensity: wall.sector.fogDensity ?? 0.25,
      visibilityDistance: wall.sector.visibilityDistance ?? 900,
      ...computeNearestLightUniforms(pointLights, wall.center),
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
    wallShader.setAttributes({ aPosition: wall.position, aUv: wall.uv, aNormal: wall.normal });
    wall.indices.draw();
  };

  gl.disable(gl.BLEND);
  gl.depthMask(true);
  for (const wall of buffers.opaqueWalls) {
    drawWall(wall);
  }

  const transparentWalls: Array<{ wall: MapBuffers['walls'][number]; distanceSq: number }> = [];
  for (const wall of buffers.transparentWalls) {
    if (!shouldDrawWall(wall, cameraPos, visibleSectors, cameraSectorIndex)) continue;
    transparentWalls.push({ wall, distanceSq: getWallDistanceSq(wall, cameraPos) });
  }
  transparentWalls.sort((a, b) => b.distanceSq - a.distanceSq);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  for (const entry of transparentWalls) {
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

  for (const { thingObj, thingIndex, thingType, thingSector, sectorIndex } of renderableThings) {
    if (visibleSectors && !visibleSectors.has(sectorIndex)) continue;
    const dx = thingObj.x - cameraPos[0];
    const dz = -thingObj.y - cameraPos[2];
    const distanceSq = dx * dx + dz * dz;
    const visibility = thingSector.visibilityDistance ?? 900;
    if (distanceSq > (visibility + 256) * (visibility + 256)) continue;

    const voxelFrames = params.voxelThingFrames.get(thingType.sprite);
    const voxelFrame = voxelFrames?.[(animateSpriteIndex + thingIndex) % voxelFrames.length];
    if (!voxelFrame?.mesh) {
      voxelThingsPending++;
      continue;
    }

    voxelThingsDrawn++;
    renderVoxelThing({
      gl,
      shader: voxelShader,
      mesh: voxelFrame.mesh,
      thing: thingObj,
      thingKind: thingType.kind,
      sector: thingSector,
      pointLights,
      timeSeconds,
      modelMatrix,
      viewMatrix,
      projectionMatrix,
      modelViewMatrix,
      modelViewProjMatrix,
    });
  }
  gl.enable(gl.CULL_FACE);

  gl.useProgram(thingShader.program);
  gl.activeTexture(gl.TEXTURE0);
  thingShader.setAttributes({ aPosition: buffers.thing.position, aUv: buffers.thing.uv });
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);

  const spriteThings: Array<{ entry: RenderableThing; distanceSq: number }> = [];
  for (const entry of renderableThings) {
    if (visibleSectors && !visibleSectors.has(entry.sectorIndex)) continue;
    if (hasVoxelDefinitionForSprite(entry.thingType.sprite)) continue;
    const dx = entry.thingObj.x - cameraPos[0];
    const dz = -entry.thingObj.y - cameraPos[2];
    const distanceSq = dx * dx + dz * dz;
    const visibility = entry.thingSector.visibilityDistance ?? 900;
    if (distanceSq > (visibility + 256) * (visibility + 256)) continue;
    spriteThings.push({ entry, distanceSq });
  }
  spriteThings.sort((a, b) => b.distanceSq - a.distanceSq);

  for (const { entry, distanceSq: _distanceSq } of spriteThings) {
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

    const thingYPos = thingType.isFloater
      ? thingSector.ceilingheight - thingSprite.sprite.height / 2
      : thingSector.floorheight + thingSprite.sprite.height / 2;

    mat4.identity(modelMatrix);
    mat4.translate(modelMatrix, modelMatrix, [thingObj.x, thingYPos, -thingObj.y]);
    mat4.rotateY(modelMatrix, modelMatrix, -angle({ x: dx, y: dy }));
    mat4.scale(modelMatrix, modelMatrix, [1.0, thingSprite.sprite.height, thingSprite.sprite.width]);

    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);

    const thingWorldPos: [number, number, number] = [thingObj.x, thingYPos, -thingObj.y];
    const emissive = getThingEmissiveUniforms(thingObj);

    thingShader.setUniforms({
      shouldMirror: thingSprite.mirror,
      modelViewProj: modelViewProjMatrix,
      tex: textures.things[thingSprite.sprite.name],
      lightIntensity: thingSector.lightIntensity,
      fogColor: thingSector.fogColor ?? [0.025, 0.022, 0.02],
      fogDensity: thingSector.fogDensity ?? 0.25,
      visibilityDistance: thingSector.visibilityDistance ?? 900,
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
}

function shouldDrawFlat(
  flat: FlatBuffer,
  cameraPos: [number, number, number],
  _visibleSectors: Set<number> | null,
  cameraSectorIndex: number
): boolean {
  // Floors/ceilings span multiple heights at the same XY footprint (stairs, bridges).
  // Use horizontal distance only and skip coarse sector-set culling for flats.
  return isDrawVisible(
    flat.center,
    cameraPos,
    flat.sector.visibilityDistance ?? 900,
    null,
    flat.sectorIndex,
    cameraSectorIndex,
    true
  );
}

function shouldDrawWall(
  wall: MapBuffers['walls'][number],
  cameraPos: [number, number, number],
  visibleSectors: Set<number> | null,
  cameraSectorIndex: number
): boolean {
  return isDrawVisible(
    wall.center,
    cameraPos,
    wall.sector.visibilityDistance ?? 900,
    visibleSectors,
    wall.sectorIndex,
    cameraSectorIndex,
    false
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
    pointLights: PointLight[];
    cameraPos: [number, number, number];
  }
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

  ctx.flatShader.setUniforms({
    tex: ctx.textures.flats[flatName],
    heightTex:
      ctx.textures.heightFlats[flatReliefKey] ??
      ctx.textures.heightFlats[flatName] ??
      ctx.textures.heightFallback,
    lightIntensity: flat.sector.lightIntensity,
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
    visibilityDistance: flat.sector.visibilityDistance ?? 900,
    ...computeNearestLightUniforms(ctx.pointLights, flat.center),
    liquidColor: floorLiquid?.liquidColor ?? [0, 0, 0],
    liquidStrength: floorLiquid?.liquidStrength ?? 0,
    liquidEmissive: floorLiquid?.liquidEmissive ?? 0,
    uCameraPos: ctx.cameraPos,
    heightStrength,
    timeSeconds: ctx.timeSeconds,
  });

  ctx.flatShader.setAttributes({ aPosition: flat.position, aNormal: flat.normal });
  flat.indices.draw();
}

function renderVoxelThing({
  gl,
  shader,
  mesh,
  thing,
  thingKind,
  sector,
  pointLights,
  timeSeconds,
  modelMatrix,
  viewMatrix,
  projectionMatrix,
  modelViewMatrix,
  modelViewProjMatrix,
}: {
  gl: WebGL2RenderingContext;
  shader: ShaderProgram;
  mesh: RuntimeVoxelMesh;
  thing: Thing;
  thingKind: ThingKind | undefined;
  sector: Sector;
  pointLights: PointLight[];
  timeSeconds: number;
  modelMatrix: mat4;
  viewMatrix: mat4;
  projectionMatrix: mat4;
  modelViewMatrix: mat4;
  modelViewProjMatrix: mat4;
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

  mat4.identity(modelMatrix);
  mat4.translate(modelMatrix, modelMatrix, [thing.x, y, -thing.y]);
  mat4.rotateY(modelMatrix, modelMatrix, Math.PI / 2 - yaw);
  mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
  mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);

  gl.useProgram(shader.program);
  shader.setUniforms({
    modelViewProj: modelViewProjMatrix,
    lightIntensity: Math.max(sector.lightIntensity ?? 0.5, 0.35),
    fogColor: sector.fogColor ?? [0.025, 0.022, 0.02],
    fogDensity: sector.fogDensity ?? 0.25,
    visibilityDistance: sector.visibilityDistance ?? 900,
    dynamicLight: computeDynamicLightAt(pointLights, thingWorldPos),
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
