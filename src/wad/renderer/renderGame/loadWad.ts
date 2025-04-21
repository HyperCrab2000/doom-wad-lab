import { Wad } from '@/wad/interfaces/Wad';
import { WadMap } from '@/wad/interfaces/WadMap';
import { WadAssets, drawWadAssets } from '@/wad/renderer/drawAssets/drawWadAssets';
import { canvasToTexture } from 'apl-easy-gl';
import { createMapBuffers, MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import { selectSkyTexture } from '@/wad/renderer/utils/selectSkyTexture';
import { SpriteTexture } from '@/wad/interfaces/SpriteTexture';
import { ThingSprite, FramesByThingNameMap } from './types';
import { playerHeight } from '@/wad/constants/GameInfo';
import { Sector } from '@/wad/interfaces/Sector';
import { findTrianglesAtPosition } from '@/wad/utils/findTrianglesAtPosition';
import { pointInTriangle } from '@/wad/utils/pointInTriangle';
import { Triangle } from '@/wad/interfaces/Triangle';
import { AabbPointType } from '@/wad/interfaces/TriangleCache';
import { insertAabbCacheItem } from '@/wad/utils/insertAabbCache';

interface TriangleHashObject {
  triangle: Triangle;
  sector: Sector;
}

export interface LoadedWadData {
  wad: Wad;
  wadAssets: WadAssets;
  textures: {
    flats: Record<string, WebGLTexture>;
    walls: Record<string, WebGLTexture>;
    things: Record<string, WebGLTexture>;
    sky: Record<string, WebGLTexture>;
  };
  sortedFramesByThingName: FramesByThingNameMap;
  currentSky: string;
  buffers: MapBuffers;
  playerStart: { x: number; y: number };
  cameraAngle: number;
  playerZ: number;
}

export function getAverageColor(canvas: HTMLCanvasElement): [number, number, number] {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < imageData.length; i += 4) {
    r += imageData[i];
    g += imageData[i + 1];
    b += imageData[i + 2];
    count++;
  }

  return [r / count / 255, g / count / 255, b / count / 255];
}

function createEnhancedTexture(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    canvas
  );

  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  const ext = gl.getExtension('EXT_texture_filter_anisotropic');
  if (ext) {
    gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 16);
  }

  return tex;
}

function extractFramesFromSprites(sprites: Record<string, SpriteTexture>): FramesByThingNameMap {
  const framesByThingName: FramesByThingNameMap = {};

  Object.keys(sprites).forEach((spriteName) => {
    const sprite = sprites[spriteName];
    const thingName = spriteName.slice(0, 4);
    const frameChar = spriteName[4].charCodeAt(0);
    const dir1 = parseInt(spriteName[5], 10) || 0;

    framesByThingName[thingName] = framesByThingName[thingName] || {};
    const frames = framesByThingName[thingName];
    frames[dir1] = frames[dir1] || {};
    frames[dir1][frameChar] = { sprite };

    if (spriteName.length > 6) {
      const frameChar2 = spriteName[6].charCodeAt(0);
      const dir2 = parseInt(spriteName[7], 10) || 0;
      frames[dir2] = frames[dir2] || {};
      frames[dir2][frameChar2] = { sprite, mirror: true };
    }
  });

  return Object.keys(framesByThingName).reduce<FramesByThingNameMap>((acc, thingName) => {
    const frames = framesByThingName[thingName];
    acc[thingName] = Object.keys(frames).map(Number).reduce<Record<number, Record<number, ThingSprite>>>((acc2, dir) => {
      const dirFrames = frames[dir];
      acc2[dir] = {};
      Object.keys(dirFrames).map(Number).forEach((frameKey) => {
        acc2[dir][frameKey] = dirFrames[frameKey];
      });
      return acc2;
    }, {});
    return acc;
  }, {});
}

export function loadWad(
  gl: WebGL2RenderingContext,
  wad: Wad,
  map: WadMap,
  mapName: string
): LoadedWadData {
  const wadAssets = drawWadAssets(wad);
  const sortedFramesByThingName = extractFramesFromSprites(wadAssets.spritesByName);

  const textures = {
    flats: wadAssets.flats.reduce((acc, flat) => {
      acc[flat.name] = createEnhancedTexture(gl, flat.graphics.canvas);
      return acc;
    }, {} as Record<string, WebGLTexture>),

    walls: wadAssets.textures.reduce((acc, tex) => {
      acc[tex.name] = createEnhancedTexture(gl, tex.graphics.canvas);
      return acc;
    }, {} as Record<string, WebGLTexture>),

    things: wadAssets.sprites.reduce((acc, sprite) => {
      acc[sprite.name] = canvasToTexture(gl, sprite.graphics.canvas, {
        minFilter: gl.LINEAR_MIPMAP_LINEAR,
        magFilter: gl.LINEAR,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.CLAMP_TO_EDGE,
      });
      return acc;
    }, {} as Record<string, WebGLTexture>),

    sky: Object.create(null) as Record<string, WebGLTexture>,
  };

  ['SKY1', 'SKY2', 'SKY3'].forEach((skyName) => {
    const asset = wadAssets.texturesByName[skyName];
    if (asset) {
      textures.sky[skyName] = createEnhancedTexture(gl, asset.graphics.canvas);
    }
  });

  const currentSky = selectSkyTexture(mapName);
  const buffers = createMapBuffers(gl, map, wadAssets.texturesByName);

  const textureColors = new Map<string, [number, number, number]>();
  wadAssets.flats.forEach((flat) => {
    textureColors.set(flat.name, getAverageColor(flat.graphics.canvas));
  });

  buffers.flats.forEach((flat) => {
    flat.sector.ambientColor = textureColors.get(flat.flatName) ?? [1, 1, 1];
  });

  const playerStartThing = map.THINGS.find((thing) => thing.type === 1);
  const playerStart = { x: playerStartThing?.x ?? 0, y: playerStartThing?.y ?? 0 };
  const cameraAngle = (playerStartThing?.angle ?? 0) * Math.PI / 180;

  const mapTriangleHash = { x: [], y: [] };
  map.SECTORS.forEach((_, sectorIndex) => {
    buffers.sectorTriangles[sectorIndex].forEach((triangle) => {
      const obj = { triangle, sector: map.SECTORS[sectorIndex] };
      insertAabbCacheItem(mapTriangleHash.x, { val: Math.min(triangle[0].x, triangle[1].x, triangle[2].x), type: AabbPointType.min, obj });
      insertAabbCacheItem(mapTriangleHash.x, { val: Math.max(triangle[0].x, triangle[1].x, triangle[2].x), type: AabbPointType.max, obj });
      insertAabbCacheItem(mapTriangleHash.y, { val: Math.min(triangle[0].y, triangle[1].y, triangle[2].y), type: AabbPointType.min, obj });
      insertAabbCacheItem(mapTriangleHash.y, { val: Math.max(triangle[0].y, triangle[1].y, triangle[2].y), type: AabbPointType.max, obj });
    });
  });

  const sectorTriangles = findTrianglesAtPosition<TriangleHashObject>(mapTriangleHash, playerStart);
  const playerSector = sectorTriangles.items.find((item) => pointInTriangle(playerStart, item.triangle))?.sector;
  const playerZ = (playerSector?.floorheight ?? 0) + playerHeight;

  return {
    wad,
    wadAssets,
    textures,
    sortedFramesByThingName,
    currentSky,
    buffers,
    playerStart,
    cameraAngle,
    playerZ,
  };
}