import { mat4 } from 'gl-matrix';
import { ShaderProgram } from 'apl-easy-gl';
import { Wad } from '@/wad/interfaces/Wad';
import { WadMap } from '@/wad/interfaces/WadMap';
import { WadAssets } from '@/wad/renderer/drawAssets/drawWadAssets';
import { createSkyboxBuffers, drawSkybox } from '@/wad/renderer/drawAssets/drawSkybox';
import { Thing } from '@/wad/interfaces/Thing';
import { ThingKind } from '@/wad/constants/ThingTypes';
import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import { hasValidFlags } from '@/wad/renderer/utils/hasValidFlags';
import { angle } from '@/wad/utils/math';
import { FramesByThingNameMap } from './types';
import { Sector } from '@/wad/interfaces/Sector';
import { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import { FlatBuffer } from '@/wad/interfaces/FlatBuffer';

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
  };
  currentSky: string;
  buffers: MapBuffers;
  skyboxBuffers: ReturnType<typeof createSkyboxBuffers>; // ✅ Add this
  wad: Wad;
  map: WadMap;
  wadAssets: WadAssets;
  sortedFramesByThingName: FramesByThingNameMap;
  animateFlatIndex: number;
  animateWallIndex: number;
  animateSpriteIndex: number;
  sectorsByThing: Map<Thing, Sector>;
}

export function drawScene(params: DrawSceneParams) {
  const {
    gl, shaders, projectionMatrix, modelMatrix, viewMatrix, modelViewMatrix,
    modelViewProjMatrix, cameraPos, textures, currentSky, buffers,
    wad, map, wadAssets, sortedFramesByThingName,
    animateFlatIndex, animateWallIndex, animateSpriteIndex, skyboxBuffers
  } = params;

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Skybox
  const dx = cameraPos[0] - cameraPos[0];
  const dy = cameraPos[2] - cameraPos[2];
  const yaw = Math.atan2(dx, dy);
  drawSkybox(gl, shaders.skybox, skyboxBuffers, textures.sky[currentSky], yaw);

  // Setup transforms
  mat4.identity(modelMatrix);
  mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
  mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);

  // Floor rendering
  const flatShader = shaders.flats;
  gl.useProgram(flatShader.program);
  flatShader.setUniforms({ modelViewProj: modelViewProjMatrix });

  console.log('[DRAW] flats:', buffers.flats.length);
  buffers.flats.forEach((flat: FlatBuffer) => {
    let flatName = flat.flatName;
    const animatedFlat = wad.animatedFlats[flatName];
    if (animatedFlat) {
      flatName = animatedFlat[animateFlatIndex % animatedFlat.length];
    }

    flatShader.setUniforms({
      tex: textures.flats[flatName],
      lightIntensity: flat.sector.lightIntensity,
    });
    flatShader.setUniforms({
      lightDir: [0.3, 1.0, 0.4], // ☀️ tweak this for dramatic lighting
    });
    flatShader.setAttributes({ aPosition: flat.position, aNormal: flat.normal });
    flat.indices.draw();
  });

  // Wall rendering
  const wallShader = shaders.walls;
  gl.useProgram(wallShader.program);
  wallShader.setUniforms({ modelViewProj: modelViewProjMatrix });

  buffers.walls.forEach((wall) => {
    let textureName = wall.texName;
    const animatedTexture = wad.animatedTextures[textureName];
    if (animatedTexture) {
      textureName = animatedTexture[animateWallIndex % animatedTexture.length];
    }

    wallShader.setUniforms({
      tex: textures.walls[textureName],
      lightIntensity: wall.sector.lightIntensity,
      shouldClip: wadAssets.texturesByName[textureName].transparent,
    });
    wallShader.setAttributes({ aPosition: wall.position, aUv: wall.uv });
    wall.indices.draw();
  });

  // Things (sprites)
  const thingShader = shaders.things;
  gl.useProgram(thingShader.program);
  gl.activeTexture(gl.TEXTURE0);
  thingShader.setAttributes({ aPosition: buffers.thing.position, aUv: buffers.thing.uv });

  map.THINGS.forEach((thingObj: Thing, thingIndex: number) => {
    const thingType = DOOM_THING_MAP_BY_ID[Number(thingObj.type)];
    if (!thingType || !hasValidFlags(thingObj)) return;
    if ([1, 2, 3, 4].includes(thingObj.type)) return;

    const allowableKinds = [
      ThingKind.Artifact, ThingKind.Monster, ThingKind.Boss, ThingKind.Key,
      ThingKind.Barrel, ThingKind.Decoration, ThingKind.Hazard, ThingKind.Pickup,
      ThingKind.Weapon, ThingKind.Powerup
    ];
    const kind = thingType.kind?.toLowerCase() ?? '';
    if (!allowableKinds.map(k => k.toLowerCase()).includes(kind)) return;

    const dx = thingObj.x - cameraPos[0];
    const dy = -thingObj.y - cameraPos[2];
    let spriteDirAngle = Math.atan2(dy, dx) + Math.PI / 8;
    if (spriteDirAngle < 0) spriteDirAngle += Math.PI * 2;
    const dirIndex = Math.floor(spriteDirAngle / (Math.PI / 4)) + 1;

    if (!thingType.sprite) return;
    const spriteObj = sortedFramesByThingName[thingType.sprite];
    let spriteFrames = spriteObj[dirIndex] || spriteObj[parseInt(Object.keys(spriteObj)[0], 10)];
    if (!spriteFrames) return;

    const frameIds = Object.keys(spriteFrames).map(Number).sort();
    const frameId = frameIds[(animateSpriteIndex + thingIndex) % frameIds.length];
    const thingSprite = spriteFrames[frameId];

    const thingSector = params.sectorsByThing.get(thingObj);
    if (!thingSector) return;

    const thingYPos = thingType.isFloater
      ? thingSector.ceilingheight - thingSprite.sprite.height / 2
      : thingSector.floorheight + thingSprite.sprite.height / 2;

    mat4.identity(modelMatrix);
    mat4.translate(modelMatrix, modelMatrix, [thingObj.x, thingYPos, -thingObj.y]);
    mat4.rotateY(modelMatrix, modelMatrix, -angle({ x: dx, y: dy }));
    mat4.scale(modelMatrix, modelMatrix, [1.0, thingSprite.sprite.height, thingSprite.sprite.width]);

    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);

    thingShader.setUniforms({
      shouldMirror: thingSprite.mirror,
      modelViewProj: modelViewProjMatrix,
      tex: textures.things[thingSprite.sprite.name],
      lightIntensity: thingSector.lightIntensity,
    });

    buffers.thing.indices.draw();
  });
}