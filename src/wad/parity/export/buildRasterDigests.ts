import { crc32 } from '../../../../gzstate/crc32';
import { internString } from '../../../../gzstate/gzstateWriter';
import type { GzstateRasterDigest } from '../../../../gzstate/types';
import type { Wad } from '@/wad/interfaces/Wad';

import { collectMarkerRangeNames } from '../collectLumpNames';
import { rasterizeFlat } from '../raster/rasterizeFlat';
import { rasterizePatch } from '../raster/rasterizePatch';
import { rasterizeTexture } from '../raster/rasterizeTexture';

export const RASTER_KIND = {
  PATCH: 0,
  FLAT: 1,
  SPRITE: 2,
  TEXTURE: 3,
} as const;

function digestImage(strings: string[], name: string, kind: number, image: { width: number; height: number; rgba: Uint8Array }): GzstateRasterDigest {
  return {
    nameIndex: internString(strings, name.toUpperCase()),
    kind,
    width: image.width,
    height: image.height,
    rgbaCrc32: crc32(image.rgba),
  };
}

export function buildPatchRasterDigests(wad: Wad, strings: string[]): GzstateRasterDigest[] {
  return wad.pnames
    .map((name) => {
      const lump = wad.lumpHash[name];
      if (!lump) return null;
      return digestImage(strings, name, RASTER_KIND.PATCH, rasterizePatch(lump, wad.playpal));
    })
    .filter((entry): entry is GzstateRasterDigest => entry !== null)
    .sort((a, b) => (strings[a.nameIndex] ?? '').localeCompare(strings[b.nameIndex] ?? ''));
}

export function buildFlatRasterDigests(wad: Wad, strings: string[]): GzstateRasterDigest[] {
  return collectMarkerRangeNames(wad.lumpInfo, 'F')
    .map((name) => {
      const lump = wad.flats[name];
      if (!lump) return null;
      return digestImage(strings, name, RASTER_KIND.FLAT, rasterizeFlat(lump, wad.playpal));
    })
    .filter((entry): entry is GzstateRasterDigest => entry !== null)
    .sort((a, b) => (strings[a.nameIndex] ?? '').localeCompare(strings[b.nameIndex] ?? ''));
}

export function buildSpriteRasterDigests(wad: Wad, strings: string[]): GzstateRasterDigest[] {
  return collectMarkerRangeNames(wad.lumpInfo, 'S')
    .map((name) => {
      const lump = wad.sprites[name];
      if (!lump) return null;
      return digestImage(strings, name, RASTER_KIND.SPRITE, rasterizePatch(lump, wad.playpal));
    })
    .filter((entry): entry is GzstateRasterDigest => entry !== null)
    .sort((a, b) => (strings[a.nameIndex] ?? '').localeCompare(strings[b.nameIndex] ?? ''));
}

export function buildTextureRasterDigests(wad: Wad, strings: string[]): GzstateRasterDigest[] {
  return Object.keys(wad.textures)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const tex = wad.textures[name]!;
      return digestImage(strings, tex.texName, RASTER_KIND.TEXTURE, rasterizeTexture(tex, wad, wad.playpal));
    });
}
