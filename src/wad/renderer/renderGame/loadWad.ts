import { Wad } from '@/wad/interfaces/Wad';
import { WadMap } from '@/wad/interfaces/WadMap';
import { getCachedWadAssets } from '@/wad/renderer/drawAssets/wadAssetsCache';
import { collectMapWallAndFlatNames } from '@/wad/renderer/drawAssets/collectMapAssets';
import { canvasToTexture } from 'apl-easy-gl';
import {
  attachMapBufferIndexes,
  createMapBuffersAsync,
  MapBuffers,
} from '@/wad/renderer/geometry/createBuffers';
import { selectSkyTexture } from '@/wad/renderer/utils/selectSkyTexture';
import { SpriteTexture } from '@/wad/interfaces/SpriteTexture';
import { ThingSprite, FramesByThingNameMap } from './types';
import { playerEyeHeight } from '@/wad/constants/GameInfo';
import { findTrianglesAtPosition } from '@/wad/utils/findTrianglesAtPosition';
import { pointInTriangle } from '@/wad/utils/pointInTriangle';
import { getEmissiveColor, hasSkyWindow } from '@/wad/renderer/renderGame/lightingHeuristics';
import { getSectorLineGeometry } from '@/wad/renderer/geometry/getLineDefsBySector';
import {
  applySectorFloorLighting,
  createThingPointLights,
  getSectorVisibilityDistance,
} from './sectorLighting';
import { PointLight } from './sectorLighting';
import { Thing } from '@/wad/interfaces/Thing';
import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import { doomAngleToYaw } from '@/wad/renderer/controls/playerView';
import { createVoxelThingFrameMap, VoxelThingFrameMap } from './voxelThingMeshes';
import { createHeightTextureSet, propagateWallHeightRelief } from './heightTextures';
import { WallTexture } from '@/wad/interfaces/WallTexture';
import { buildSectorTriangleHash, TriangleHashObject } from '@/wad/renderer/utils/sectorLookup';
import { buildSectorVisibilityIndex, finalizeSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { buildRenderableThings, RenderableThing } from './renderableThings';
import { Sector } from '@/wad/interfaces/Sector';
import {
  getCachedMapLoad,
  mapLoadCacheKey,
  setCachedMapLoad,
} from './mapLoadCache';

export interface LoadedWadData {
  wad: Wad;
  wadAssets: import('@/wad/renderer/drawAssets/drawWadAssets').WadAssets;
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
  sortedFramesByThingName: FramesByThingNameMap;
  currentSky: string;
  buffers: MapBuffers;
  playerStart: { x: number; y: number };
  cameraAngle: number;
  playerZ: number;
  sectorsByThing: Map<Thing, Sector>;
  renderableThings: RenderableThing[];
  voxelThingFrames: VoxelThingFrameMap;
  pointLights: PointLight[];
  wallTexturesByName: Record<string, WallTexture>;
}

export async function loadWad(
  gl: WebGL2RenderingContext,
  wad: Wad,
  map: WadMap,
  mapName: string,
  wadPath?: string | null
): Promise<LoadedWadData> {
  const cacheKey = mapLoadCacheKey(wadPath, mapName);
  const cached = getCachedMapLoad(cacheKey);
  if (cached) return cached;

  const promise = loadWadUncached(gl, wad, map, mapName, wadPath);
  return setCachedMapLoad(cacheKey, promise);
}

async function loadWadUncached(
  gl: WebGL2RenderingContext,
  wad: Wad,
  map: WadMap,
  mapName: string,
  wadPath?: string | null
): Promise<LoadedWadData> {
  map.SECTORS.forEach((sector) => {
    sector.visibilityDistance = getSectorVisibilityDistance(sector);
  });

  const wadAssets = getCachedWadAssets(wad, map, mapName, wadPath);
  const sortedFramesByThingName = extractFramesFromSprites(wadAssets.spritesByName);

  const { wallNames: mapWallNames, flatNames: mapFlatNames } = collectMapWallAndFlatNames(wad, map, mapName);
  const wallNames = new Set(mapWallNames);
  const flatNames = new Set(mapFlatNames);
  Object.values(wad.animatedTextures).forEach((names) => names.forEach((name) => wallNames.add(name)));
  Object.values(wad.animatedFlats).forEach((names) => names.forEach((name) => flatNames.add(name)));

  const wallNameList = [...wallNames];
  const flatNameList = [...flatNames];
  const currentSky = selectSkyTexture(mapName);

  const heightSources = {
    wallCanvases: Object.fromEntries(
      wallNameList.map((name) => {
        const tex = wadAssets.texturesByName[name] ?? wadAssets.texturesByName[name.toUpperCase()];
        return [name, tex?.graphics.canvas];
      })
    ),
    flatCanvases: Object.fromEntries(
      flatNameList.map((name) => {
        const flat = wadAssets.flats.find(
          (entry) => entry.name === name || entry.name.toUpperCase() === name.toUpperCase()
        );
        return [name, flat?.graphics.canvas];
      })
    ),
    wallSizes: Object.fromEntries(
      wallNameList.map((name) => {
        const tex = wadAssets.texturesByName[name];
        return [name, tex ? { width: tex.width, height: tex.height } : undefined];
      })
    ),
  };

  const [buffers, heightTextures] = await Promise.all([
    createMapBuffersAsync(gl, map, wadAssets.texturesByName),
    createHeightTextureSet(gl, wallNameList, flatNameList, heightSources),
  ]);

  propagateWallHeightRelief(heightTextures, wad.animatedTextures);

  const textures = {
    flats: {} as Record<string, WebGLTexture>,
    walls: {} as Record<string, WebGLTexture>,
    things: {} as Record<string, WebGLTexture>,
    sky: Object.create(null) as Record<string, WebGLTexture>,
    heightWalls: heightTextures.walls,
    heightFlats: heightTextures.flats,
    heightFallback: heightTextures.fallback,
    heightWallLoaded: heightTextures.loadedWalls,
    heightFlatLoaded: heightTextures.loadedFlats,
    reliefWalls: heightTextures.reliefWalls,
    reliefFlats: heightTextures.reliefFlats,
  };

  for (const flat of wadAssets.flats) {
    textures.flats[flat.name] = createEnhancedTexture(gl, flat.graphics.canvas);
  }
  for (const tex of wadAssets.textures) {
    textures.walls[tex.name] = createEnhancedTexture(gl, tex.graphics.canvas);
  }
  for (const sprite of wadAssets.sprites) {
    textures.things[sprite.name] = canvasToTexture(gl, sprite.graphics.canvas, {
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });
  }

  for (const skyName of ['SKY1', 'SKY2', 'SKY3', 'SKY4'] as const) {
    const asset = wadAssets.texturesByName[skyName];
    if (asset) {
      textures.sky[skyName] = createEnhancedTexture(gl, asset.graphics.canvas);
    }
  }

  const textureColors = new Map<string, [number, number, number]>();
  wadAssets.flats.forEach((flat) => {
    textureColors.set(flat.name, getEmissiveColor(flat.graphics.canvas));
  });

  const wallTextureColors = new Map<string, [number, number, number]>();
  wadAssets.textures.forEach((tex) => {
    wallTextureColors.set(tex.name, getEmissiveColor(tex.graphics.canvas));
  });

  map.SECTORS.forEach((sector) => {
    const sampledColor = textureColors.get(sector.floorpic) ?? [1, 1, 1];
    applySectorFloorLighting(sector, sector.floorpic, sampledColor);
  });

  buffers.walls.forEach((wall) => {
    if (!wall.sector) return;
    const wallColor = wallTextureColors.get(wall.texName);
    if (!wallColor) return;

    if (!('ambientColorFromWall' in wall.sector)) {
      (wall.sector as Sector & { ambientColorFromWall?: [number, number, number] }).ambientColorFromWall = wallColor;
    } else {
      const prev = (wall.sector as Sector & { ambientColorFromWall: [number, number, number] }).ambientColorFromWall;
      (wall.sector as Sector & { ambientColorFromWall: [number, number, number] }).ambientColorFromWall = [
        (prev[0] + wallColor[0]) / 2,
        (prev[1] + wallColor[1]) / 2,
        (prev[2] + wallColor[2]) / 2,
      ];
    }
  });

  const playerStartThing = map.THINGS.find((thing) => thing.type === 1);
  const playerStart = { x: playerStartThing?.x ?? 0, y: playerStartThing?.y ?? 0 };
  const cameraAngle = doomAngleToYaw(playerStartThing?.angle ?? 0);

  const triangleHash = buildSectorTriangleHash(map, buffers.sectorTriangles);
  const sectorVisibility = finalizeSectorVisibilityIndex(
    buildSectorVisibilityIndex(map),
    buffers.sectorTriangles
  );
  attachMapBufferIndexes(buffers, triangleHash, sectorVisibility);

  const sectorTriangles = findTrianglesAtPosition<TriangleHashObject>(triangleHash, playerStart);

  const skySectorIndices = new Set<number>();
  map.SECTORS.forEach((sector, index) => {
    const floor = sector.floorpic.toUpperCase();
    const ceil = sector.ceilingpic.toUpperCase();
    if (floor.startsWith('F_SKY') || ceil.startsWith('F_SKY')) {
      skySectorIndices.add(index);
    }
  });

  const sectorLines = getSectorLineGeometry(map);
  map.SECTORS.forEach((sector, i) => {
    if (skySectorIndices.has(i)) return;
    if (hasSkyWindow(i, skySectorIndices, sectorLines)) {
      sector.skyLightTint = [0.3, 0.3, 0.5];
    }
  });

  const playerSector = sectorTriangles.items.find((item) => pointInTriangle(playerStart, item.triangle))?.sector;
  const playerZ = (playerSector?.floorheight ?? 0) + playerEyeHeight;
  const sectorsByThing = map.THINGS.reduce<Map<Thing, Sector>>((acc, thing) => {
    const candidates = findTrianglesAtPosition<TriangleHashObject>(triangleHash, thing);
    const sector = candidates.items.find((item) => pointInTriangle(thing, item.triangle))?.sector;
    if (sector) {
      acc.set(thing, sector);
    }
    return acc;
  }, new Map());

  const pointLights = createThingPointLights(map, sectorsByThing, (thing) => {
    const thingType = DOOM_THING_MAP_BY_ID[thing.type];
    if (!thingType?.sprite) return null;
    const spriteObj = sortedFramesByThingName[thingType.sprite];
    if (!spriteObj) return null;
    const firstDir = spriteObj[Number(Object.keys(spriteObj)[0])];
    if (!firstDir) return null;
    const firstFrame = firstDir[Number(Object.keys(firstDir)[0])];
    return firstFrame?.sprite.height ?? null;
  });
  const renderableThings = buildRenderableThings(map, sectorsByThing);
  const voxelThingFrames = createVoxelThingFrameMap(map);

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
    sectorsByThing,
    renderableThings,
    voxelThingFrames,
    pointLights,
    wallTexturesByName: wadAssets.texturesByName,
  };
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

  const maxDim = Math.max(canvas.width, canvas.height);
  if (maxDim > 256) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) {
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    }
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

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
