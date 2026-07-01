import { internString } from '../../../../gzstate/gzstateWriter';
import type { Wad } from '@/wad/interfaces/Wad';
import { collectCategoryNames, collectMarkerRangeNames } from '../collectLumpNames';

function sortedStringIndices(names: string[], strings: string[]): number[] {
  return names.map((name) => internString(strings, name.toUpperCase()));
}

export function buildPnames(wad: Wad, strings: string[]): number[] {
  return wad.pnames.map((name) => internString(strings, name.toUpperCase()));
}

export function buildTextureDefs(wad: Wad, strings: string[]) {
  const names = Object.keys(wad.textures).sort((a, b) => a.localeCompare(b));
  return names.map((name) => {
    const tex = wad.textures[name]!;
    return {
      nameIndex: internString(strings, tex.texName.toUpperCase()),
      width: tex.texWidth,
      height: tex.texHeight,
      patches: tex.patches.map((patch) => ({
        originX: patch.originX,
        originY: patch.originY,
        patchIndex: patch.patchIndex,
      })),
    };
  });
}

export function buildFlatNames(wad: Wad, strings: string[]): number[] {
  return sortedStringIndices(collectMarkerRangeNames(wad.lumpInfo, 'F'), strings);
}

export function buildSpriteNames(wad: Wad, strings: string[]): number[] {
  return sortedStringIndices(collectMarkerRangeNames(wad.lumpInfo, 'S'), strings);
}

export function buildMusicNames(wad: Wad, strings: string[]): number[] {
  return sortedStringIndices(collectCategoryNames(wad.lumpInfo, 'music'), strings);
}

export function buildSoundNames(wad: Wad, strings: string[]): number[] {
  return sortedStringIndices(collectCategoryNames(wad.lumpInfo, 'sound'), strings);
}
