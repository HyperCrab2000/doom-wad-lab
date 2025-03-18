import { skyFlats } from '@/parser/constants/WadInfo';

import type { SpriteTexture } from '@/wad/interfaces/SpriteTexture';
import type { FlatTexture } from '@/wad/interfaces/FlatTexture';
import type { Wad } from '@/wad/interfaces/Wad';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import { drawPatch } from '@/parser/render/drawPatch';
import { drawTexture } from '@/parser/render/drawTexture';
import { drawFlat } from '@/parser/render/drawFlat';
import { drawSprite } from '@/parser/render/drawSprite';

export interface WadAssets {
  texturesByName: Record<string, WallTexture>;
  spritesByName: Record<string, SpriteTexture>;
  textures: Array<WallTexture>;
  sprites: Array<SpriteTexture>;
  flats: Array<FlatTexture>;
}

export const drawWadAssets = (wad: Wad): WadAssets => {
  const patchesByName = wad.pnames.reduce<Record<string, CanvasRenderingContext2D>>(
    (acc: { [x: string]: CanvasRenderingContext2D }, patchName: string) => {
      let patchLump = wad.lumpHash[patchName];

      if (!patchLump) {
        //some wads misplace their patches (freedoom :P)
        patchLump = wad.sprites[patchName];

        if (!patchLump) {
          throw new Error('Patch not found: ' + patchName);
        }
      }

      acc[patchName] = drawPatch(patchLump, wad.playpal);
      return acc;
    },
    {}
  );

  const textures = Object.keys(wad.textures).map((texName) => ({
    ...drawTexture(wad.textures[texName], wad, patchesByName),
    name: texName,
  }));

  const texturesByName = textures.reduce<Record<string, WallTexture>>((acc, texture) => {
    acc[texture.name] = texture;
    return acc;
  }, {});

  const flats = Object.keys(wad.flats)
    .filter((flatName) => !skyFlats.includes(flatName))
    .map((flatName) => ({
      name: flatName,
      graphics: drawFlat(wad.flats[flatName], wad.playpal),
    }));

  const sprites = Object.keys(wad.sprites).map((spriteName) => ({
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
};
