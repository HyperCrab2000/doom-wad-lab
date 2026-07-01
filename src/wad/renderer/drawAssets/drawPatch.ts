import type { ColourPalette } from '@/wad/interfaces/ColourPalette';
import type { Wad } from '@/wad/interfaces/Wad';
import { rasterizePatch as coreRasterizePatch } from '@hypercrab2000/doom-wad-core';

import { rasterImageToCanvas } from '@/wad/adapters/rasterToCanvas';

export const drawPatch = (
  patchLump: ArrayBuffer,
  colourPalette: ColourPalette
): CanvasRenderingContext2D => {
  return rasterImageToCanvas(coreRasterizePatch(patchLump, colourPalette));
};

export function getOrBuildPatch(
  wad: Wad,
  patchesByName: Record<string, CanvasRenderingContext2D>,
  patchName: string
): CanvasRenderingContext2D | undefined {
  if (patchesByName[patchName]) {
    return patchesByName[patchName];
  }

  let patchLump = wad.lumpHash[patchName];
  if (!patchLump) {
    patchLump = wad.sprites[patchName];
    if (!patchLump) return undefined;
  }

  patchesByName[patchName] = drawPatch(patchLump, wad.playpal);
  return patchesByName[patchName];
}
