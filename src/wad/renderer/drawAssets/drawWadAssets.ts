import { skyFlats } from '@/wad/constants/WadInfo';

import type { SpriteTexture } from '@/wad/interfaces/SpriteTexture';
import type { FlatTexture } from '@/wad/interfaces/FlatTexture';
import type { Wad } from '@/wad/interfaces/Wad';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import { drawPatch, getOrBuildPatch } from '@/wad/renderer/drawAssets/drawPatch';
import { drawTexture } from '@/wad/renderer/drawAssets/drawTexture';
import { drawFlat } from '@/wad/renderer/drawAssets/drawFlat';
import { drawSprite } from '@/wad/renderer/drawAssets/drawSprite';
import { collectMapAssetNames, type MapAssetNames } from '@/wad/renderer/drawAssets/collectMapAssets';
import type { WadMap } from '@/wad/interfaces/WadMap';

export interface WadAssets {
  texturesByName: Record<string, WallTexture>;
  spritesByName: Record<string, SpriteTexture>;
  textures: Array<WallTexture>;
  sprites: Array<SpriteTexture>;
  flats: Array<FlatTexture>;
}

function buildPatchesByName(
  wad: Wad,
  patchNames: Iterable<string>
): Record<string, CanvasRenderingContext2D> {
  const patchesByName: Record<string, CanvasRenderingContext2D> = {};

  for (const patchName of patchNames) {
    getOrBuildPatch(wad, patchesByName, patchName);
  }

  return patchesByName;
}

function drawWadAssetsFromNames(wad: Wad, names: MapAssetNames): WadAssets {
  const patchesByName = buildPatchesByName(wad, names.patchLumps);

  const textures = [...names.wallTextures]
    .filter((texName) => wad.textures[texName])
    .map((texName) => ({
      ...drawTexture(wad.textures[texName], wad, patchesByName),
      name: texName,
    }));

  const texturesByName = textures.reduce<Record<string, WallTexture>>((acc, texture) => {
    acc[texture.name] = texture;
    return acc;
  }, {});

  const flats = [...names.flats]
    .filter((flatName) => wad.flats[flatName] && !skyFlats.includes(flatName))
    .map((flatName) => ({
      name: flatName,
      graphics: drawFlat(wad.flats[flatName], wad.playpal),
    }));

  const sprites = [...names.spriteLumps]
    .filter((spriteName) => wad.sprites[spriteName])
    .map((spriteName) => ({
      ...drawSprite(wad.sprites[spriteName], wad.playpal),
      name: spriteName,
    }));

  const spritesByName = sprites.reduce<Record<string, SpriteTexture>>((acc, sprite) => {
    acc[sprite.name] = sprite;
    return acc;
  }, {});

  return {
    textures,
    flats,
    sprites,
    texturesByName,
    spritesByName,
  };
}

export const drawWadAssetsForMap = (wad: Wad, map: WadMap, mapName: string): WadAssets => {
  const names = collectMapAssetNames(wad, map, mapName);
  return drawWadAssetsFromNames(wad, names);
};

export const drawWadAssets = (wad: Wad): WadAssets => {
  const names: MapAssetNames = {
    wallTextures: new Set(Object.keys(wad.textures)),
    flats: new Set(Object.keys(wad.flats).filter((flatName) => !skyFlats.includes(flatName))),
    spriteLumps: new Set(Object.keys(wad.sprites)),
    patchLumps: new Set(wad.pnames),
  };
  return drawWadAssetsFromNames(wad, names);
};
