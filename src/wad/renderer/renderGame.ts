import {
  createContext,
  createRenderer,
  canvasToTexture,
  ShaderProgram,
  createProgram,
} from 'apl-easy-gl';
import { mat4, vec3 } from 'gl-matrix';

import { animatedFlatFps, animatedWallFps, animatedSpriteFps } from '@/wad/constants/WadInfo';
import { playerHeight } from '@/wad/constants/GameInfo';

import { angle } from '@/wad/utils/math';
import { insertAabbCacheItem } from '@/wad/utils/insertAabbCache';
import { findTrianglesAtPosition } from '@/wad/utils/findTrianglesAtPosition';
import { pointInTriangle } from '@/wad/utils/pointInTriangle';
import { freenavControls } from '@/wad/renderer/controls/freenavControls';
import { createMapBuffers, MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import { drawWadAssets, WadAssets } from '@/wad/renderer/drawAssets/drawWadAssets';

import wallsVert from '@/wad/renderer/shaders/walls.vert';
import wallsFrag from '@/wad/renderer/shaders/walls.frag';
import flatVert from '@/wad/renderer/shaders/flat.vert';
import flatFrag from '@/wad/renderer/shaders/flat.frag';
import skyVert from '@/wad/renderer/shaders/sky.vert';
import skyFrag from '@/wad/renderer/shaders/sky.frag';
import skyboxVert from '@/wad/renderer/shaders/skyBox.vert';
import skyboxFrag from '@/wad/renderer/shaders/skyBox.frag';
import thingsVert from '@/wad/renderer/shaders/things.vert';
import thingsFrag from '@/wad/renderer/shaders/things.frag';
import { Sector } from '@/wad/interfaces/Sector';
import { SpriteTexture } from '@/wad/interfaces/SpriteTexture';
import { Wad } from '@/wad/interfaces/Wad';
import { WadMap } from '@/wad/interfaces/WadMap';
import { Thing } from '@/wad/interfaces/Thing';
import { Triangle } from '@/wad/interfaces/Triangle';
import { AabbPointType } from '@/wad/interfaces/TriangleCache';
import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import { ThingKind } from '@/wad/constants/ThingTypes';
import { hasValidFlags } from '@/wad/renderer/utils/hasValidFlags';
import { createSkyboxBuffers, drawSkybox } from '@/wad/renderer/drawAssets/drawSkybox';
import { selectSkyTexture } from '@/wad/renderer/utils/selectSkyTexture';

interface TriangleHashObject {
  triangle: Triangle;
  sector: Sector;
}

interface ThingSprite {
  sprite: SpriteTexture;
  mirror?: boolean;
}

type FramesByThingNameMap = Record<string, Record<number, Record<number, ThingSprite>>>;

export const renderGame = (canvas: HTMLCanvasElement) => {
  const gl = createContext(canvas, {}, ['EXT_frag_depth']);

  const projectionMatrix = mat4.create();
  const modelMatrix = mat4.create();
  const viewMatrix = mat4.create();
  const invViewMatrix = mat4.create();
  const modelViewMatrix = mat4.create();
  const modelViewProjMatrix = mat4.create();

  const camera = {
    pos: vec3.fromValues(800.0, 900.0, -100.0),
    lookAt: vec3.fromValues(800.0, 800.0, -200.0),
    up: vec3.fromValues(0.0, 1.0, 0.0),
    near: 0.1,
    far: 64000.0,
    fov: 45,
  };

  const shaders = {
    walls: createProgram(gl, wallsVert, wallsFrag),
    flats: createProgram(gl, flatVert, flatFrag),
    sky: createProgram(gl, skyVert, skyFrag), // keep sector sky if needed
    skybox: createProgram(gl, skyboxVert, skyboxFrag), // new fullscreen shader
    things: createProgram(gl, thingsVert, thingsFrag),
  };

  let wad: Wad;
  let map: WadMap;
  let unbindControls: () => void;
  let buffers: MapBuffers;
  let animateFlatIndex: number;
  let animateWallIndex: number;
  let animateSpriteIndex: number;
  let sortedFramesByThingName: FramesByThingNameMap;
  let textures: {
    flats: Record<string, WebGLTexture>;
    walls: Record<string, WebGLTexture>;
    things: Record<string, WebGLTexture>;
    sky: Record<string, WebGLTexture>;
  };
  let skyboxBuffers: ReturnType<typeof createSkyboxBuffers>;
  let sectorsByThing: Map<Thing, Sector>;
  let time = 0;
  let wadAssets: WadAssets;
  let currentSky: string;

  const loadWad = (newWad: Wad, newMap: WadMap, mapName: string) => {
    wad = newWad;
    wadAssets = drawWadAssets(wad);

    const framesByThingName: FramesByThingNameMap = {};

    // Phase 1: organize sprites into thingName -> dir -> frame
    Object.keys(wad.sprites).forEach((spriteName) => {
      const sprite = wadAssets.spritesByName[spriteName];
      const thingName = spriteName.slice(0, 4); // e.g., SPOS
      const frameChar = spriteName[4].charCodeAt(0); // 'A' = 65
      const dir1 = parseInt(spriteName[5], 10) || 0;

      framesByThingName[thingName] = framesByThingName[thingName] || {};
      const frames = framesByThingName[thingName];

      frames[dir1] = frames[dir1] || {};
      frames[dir1][frameChar] = { sprite };

      // Handle possible mirrored frame
      if (spriteName.length > 6) {
        const frameChar2 = spriteName[6].charCodeAt(0);
        const dir2 = parseInt(spriteName[7], 10) || 0;

        frames[dir2] = frames[dir2] || {};
        frames[dir2][frameChar2] = { sprite, mirror: true };
      }
    });

    // Phase 2: normalize into sortedFramesByThingName
    sortedFramesByThingName = Object.keys(framesByThingName).reduce<FramesByThingNameMap>(
      (acc, thingName) => {
        const frames = framesByThingName[thingName];

        acc[thingName] = Object.keys(frames)
          .map((d) => parseInt(d, 10))
          .reduce<Record<number, Record<number, ThingSprite>>>((acc2, dir) => {
            const dirFrames = frames[dir];
            acc2[dir] = {};

            Object.keys(dirFrames)
              .map((f) => parseInt(f, 10))
              .forEach((frameKey) => {
                acc2[dir][frameKey] = dirFrames[frameKey];
              });

            return acc2;
          }, {});
        return acc;
      },
      {}
    );

    // Textures (same as you had)
    textures = {
      flats: wadAssets.flats.reduce<Record<string, WebGLTexture>>((acc, flat) => {
        acc[flat.name] = canvasToTexture(gl, flat.graphics.canvas, {
          minFilter: gl.LINEAR,
          magFilter: gl.NEAREST,
          wrapS: gl.REPEAT,
          wrapT: gl.REPEAT,
        });
        return acc;
      }, {}),
      walls: wadAssets.textures.reduce<Record<string, WebGLTexture>>((acc, texture) => {
        acc[texture.name] = canvasToTexture(gl, texture.graphics.canvas, {
          minFilter: texture.transparent ? gl.NEAREST : gl.LINEAR,
          magFilter: gl.NEAREST,
          wrapS: gl.REPEAT,
          wrapT: gl.REPEAT,
        });
        return acc;
      }, {}),
      things: wadAssets.sprites.reduce<Record<string, WebGLTexture>>((acc, sprite) => {
        acc[sprite.name] = canvasToTexture(gl, sprite.graphics.canvas, {
          minFilter: gl.NEAREST,
          magFilter: gl.NEAREST,
          wrapS: gl.CLAMP_TO_EDGE,
          wrapT: gl.CLAMP_TO_EDGE,
        });
        return acc;
      }, {}),
      sky: {},
    };

    // Skies (unchanged)
    ['SKY1', 'SKY2', 'SKY3'].forEach((skyName) => {
      const asset = wadAssets.texturesByName[skyName];
      if (asset) {
        const canvas = asset.graphics.canvas;
        textures.sky[skyName] = canvasToTexture(gl, canvas, {
          minFilter: gl.LINEAR,
          magFilter: gl.LINEAR,
          wrapS: gl.REPEAT,
          wrapT: gl.CLAMP_TO_EDGE,
        });
      }
    });

    loadMap(newMap, mapName);
  };

  const loadMap = (newMap: WadMap, mapName: string) => {
    map = newMap;
    console.log('MapName', mapName);

    currentSky = selectSkyTexture(mapName);
    console.log(currentSky);

    //unload the previous map
    unbindControls?.();

    //load the new map
    buffers = createMapBuffers(gl, map, wadAssets.texturesByName);

    const playerStart = map.THINGS.filter((thing) => thing.type == 1)[0];
    const rotAngle = (playerStart.angle / 180) * Math.PI;
    const playerMapPos = { x: playerStart.x, y: playerStart.y };

    const mapTriangleHash = { x: [], y: [] };

    //add each triangle in the sector to the 2d map hash
    map.SECTORS.forEach((_, sectorIndex) => {
      buffers.sectorTriangles[sectorIndex].forEach((triangle) => {
        const obj: TriangleHashObject = {
          triangle: triangle,
          sector: map.SECTORS[sectorIndex],
        };

        insertAabbCacheItem<TriangleHashObject>(mapTriangleHash.x, {
          val: Math.min(triangle[0].x, triangle[1].x, triangle[2].x),
          type: AabbPointType.min,
          obj,
        });
        insertAabbCacheItem<TriangleHashObject>(mapTriangleHash.x, {
          val: Math.max(triangle[0].x, triangle[1].x, triangle[2].x),
          type: AabbPointType.max,
          obj,
        });
        insertAabbCacheItem<TriangleHashObject>(mapTriangleHash.y, {
          val: Math.min(triangle[0].y, triangle[1].y, triangle[2].y),
          type: AabbPointType.min,
          obj,
        });
        insertAabbCacheItem<TriangleHashObject>(mapTriangleHash.y, {
          val: Math.max(triangle[0].y, triangle[1].y, triangle[2].y),
          type: AabbPointType.max,
          obj,
        });
      });
    });

    sectorsByThing = new Map<Thing, Sector>();

    map.THINGS.forEach((thingObj: Thing) => {
      const thingTriangles = findTrianglesAtPosition<TriangleHashObject>(mapTriangleHash, {
        x: thingObj.x,
        y: thingObj.y,
      });

      let thingSector: Sector | undefined;

      thingTriangles.items.some((item) => {
        if (pointInTriangle(thingObj, item.triangle)) {
          thingSector = item.sector;
          return true;
        }
      });

      if (!thingSector) {
        //oh no, no sector for this thing :P - must be an error in the map design
        console.error(thingObj);
        throw new Error('Could not find sector for thing');
      }

      sectorsByThing.set(thingObj, thingSector);
    });

    const sectorTriangles = findTrianglesAtPosition<TriangleHashObject>(
      mapTriangleHash,
      playerMapPos
    );

    let playerSector: Sector;

    sectorTriangles.items.some((item) => {
      if (pointInTriangle(playerMapPos, item.triangle)) {
        playerSector = item.sector;
        return true;
      }
    });

    const playerYPos = playerSector!.floorheight + playerHeight;

    vec3.set(camera.pos, playerStart.x, playerYPos, -playerStart.y);

    mat4.identity(viewMatrix);
    mat4.rotateY(viewMatrix, viewMatrix, Math.PI / 2 - rotAngle);
    mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), camera.pos));

    unbindControls = freenavControls(viewMatrix, canvas);
  };

  const resizeScene = () => {
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    mat4.perspective(
      projectionMatrix,
      (camera.fov / 180) * Math.PI,
      gl.canvas.width / gl.canvas.height,
      camera.near,
      camera.far
    );
  };

  const drawScene = () => {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let shader: ShaderProgram;

    const dx = camera.lookAt[0] - camera.pos[0];
    const dy = camera.lookAt[2] - camera.pos[2];
    const yaw = Math.atan2(dx, dy);

    // Doom-style skybox pass before anything else
    drawSkybox(gl, shaders.skybox, skyboxBuffers, textures.sky[currentSky], yaw);

    //things
    shader = shaders.things;

    gl.useProgram(shader.program);
    gl.activeTexture(gl.TEXTURE0);

    shader.setAttributes({
      aPosition: buffers.thing.position,
      aUv: buffers.thing.uv,
    });

    map.THINGS.forEach((thingObj: Thing, thingIndex: number) => {
      // We need to try this with 2038 in a unit test
      const thingType = DOOM_THING_MAP_BY_ID[Number(thingObj.type)];
      if (!thingType) {
        console.log("this thing didn't exist", thingObj.type);
        return;
      }

      if ([1, 2, 3, 4].includes(thingObj.type)) {
        // Only show player 1 start, ignore player 2-4 starts
        return;
      }


      // if (thingType.sprite === 'SPOS') {
      //   console.log(`SPOS thing at (${thingObj.x}, ${thingObj.y})`);
      //   // console.log('Available dirs:', Object.keys(spriteObj));
      //   // console.log('Requested dirIndex:', dirIndex);
      // }

      if (!hasValidFlags(thingObj)) return;

      const allowableThingTypes: String[] = [
        // ThingKind.Artifact,
        ThingKind.Monster,
        // ThingKind.Boss,
        // ThingKind.Key,
        // ThingKind.Barrel,
        // ThingKind.Decoration,
        // ThingKind.Hazard,
        // ThingKind.Pickup,
        // ThingKind.Weapon,
        // ThingKind.Powerup,
      ];
      const thingKind = thingType?.kind as string;

      if (
        !thingType ||
        !thingType.sprite ||
        !allowableThingTypes.map((k) => k.toLowerCase()).includes(thingKind.toLowerCase())
      ) {
        return;
      }

      const thingAngle = angle({ x: thingObj.x - camera.pos[0], y: -thingObj.y - camera.pos[2] });

      const thingSector = sectorsByThing.get(thingObj);

      if (!thingSector) return;

      const dx = thingObj.x - camera.pos[0];
      const dy = -thingObj.y - camera.pos[2];
      let spriteDirAngle = Math.atan2(dy, dx) + Math.PI / 8; // offset by 22.5 degrees
      if (spriteDirAngle < 0) spriteDirAngle += Math.PI * 2;
      const dirIndex = Math.floor(spriteDirAngle / (Math.PI / 4)) + 1; // Doom uses directions 1-8
      const spriteObj = sortedFramesByThingName[thingType.sprite];
      let spriteFrames = spriteObj[dirIndex];

// Fallback to any available direction instead of spriteObj[0]
      if (!spriteFrames) {
        const fallbackDir = Object.keys(spriteObj).map(Number)[0];
        spriteFrames = spriteObj[fallbackDir];
      }




      const frameIds = Object.keys(spriteFrames).map(Number).sort();
      const frameId = frameIds[(animateSpriteIndex + thingIndex) % frameIds.length];
      const thingSprite = spriteFrames[frameId];

      const thingYPos = thingType.isFloater
        ? thingSector.ceilingheight - thingSprite.sprite.height / 2
        : thingSector.floorheight + thingSprite.sprite.height / 2;

      mat4.identity(modelMatrix);
      mat4.translate(modelMatrix, modelMatrix, [thingObj.x, thingYPos, -thingObj.y]);
      mat4.rotateY(modelMatrix, modelMatrix, -thingAngle);
      mat4.scale(modelMatrix, modelMatrix, [
        1.0,
        thingSprite.sprite.height,
        thingSprite.sprite.width,
      ]);

      mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
      mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);

      shader.setUniforms({
        shouldMirror: thingSprite.mirror,
        modelViewProj: modelViewProjMatrix,
        tex: textures.things[thingSprite.sprite.name],
        lightIntensity: thingSector.lightIntensity,
      });

      buffers.thing.indices.draw();
    });

    //scene transforms
    mat4.identity(modelMatrix);
    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);

    //floor
    shader = shaders.flats;

    gl.useProgram(shader.program);

    shader.setUniforms({
      modelViewProj: modelViewProjMatrix,
    });

    buffers.flats.forEach((flat) => {
      let flatName = flat.flatName;

      const animatedFlat = wad.animatedFlats[flatName];

      if (animatedFlat) {
        flatName = animatedFlat[animateFlatIndex % animatedFlat.length];
      }

      shader.setUniforms({
        tex: textures.flats[flatName],
        lightIntensity: flat.sector.lightIntensity,
      });

      shader.setAttributes({
        aPosition: flat.position,
      });

      flat.indices.draw();
    });

    //walls
    shader = shaders.walls;
    gl.useProgram(shader.program);

    shader.setUniforms({
      modelViewProj: modelViewProjMatrix,
    });

    buffers.walls.forEach((wall) => {
      let textureName = wall.texName;

      const animatedTexture = wad.animatedTextures[textureName];

      if (animatedTexture) {
        textureName = animatedTexture[animateWallIndex % animatedTexture.length];
      }

      shader.setUniforms({
        tex: textures.walls[textureName],
        lightIntensity: wall.sector.lightIntensity,
        shouldClip: wadAssets.texturesByName[textureName].transparent,
      });

      shader.setAttributes({
        aPosition: wall.position,
        aUv: wall.uv,
      });

      wall.indices.draw();
    });
  };

  const renderer = createRenderer(
    () => {
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      //gl.cullFace(gl.BACK);

      //camera transform
      mat4.lookAt(viewMatrix, camera.pos, camera.lookAt, camera.up);

      // Skybox
      skyboxBuffers = createSkyboxBuffers(gl);

      //allow the user to navigate the scene by using first person controls
      unbindControls = freenavControls(viewMatrix, canvas);

      resizeScene();

      window.addEventListener('resize', () => {
        resizeScene();
      });
    },
    (dt: number) => {
      time += dt;

      animateFlatIndex = Math.floor(time / (1000 / animatedFlatFps));
      animateWallIndex = Math.floor(time / (1000 / animatedWallFps));
      animateSpriteIndex = Math.floor(time / (1000 / animatedSpriteFps));

      mat4.invert(invViewMatrix, viewMatrix);
      vec3.set(camera.pos, invViewMatrix[12], invViewMatrix[13], invViewMatrix[14]);

      if (wad && map) {
        drawScene();
      }
    }
  );

  renderer.start(window);

  return {
    loadWad,
    loadMap,
  };
};
