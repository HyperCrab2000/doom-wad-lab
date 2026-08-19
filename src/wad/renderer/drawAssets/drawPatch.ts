import type { ColourPalette } from '@/wad/interfaces/ColourPalette';
import type { Wad } from '@/wad/interfaces/Wad';
import { rasterizePatch as coreRasterizePatch } from '@hypercrab2000/doom-wad-core';

import { rasterImageToCanvas } from '@/wad/adapters/rasterToCanvas';

export interface PatchImage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  leftOffset: number;
  topOffset: number;
}

function readPatchOffsets(patchLump: ArrayBuffer): { leftOffset: number; topOffset: number } {
  const view = new DataView(patchLump);
  const leftOffset = view.getInt16(4, true);
  const topOffset = view.getInt16(6, true);
  return { leftOffset, topOffset };
}

/** Patch raster + vanilla V_DrawPatch anchor offsets. */
export function drawPatchImage(patchLump: ArrayBuffer, colourPalette: ColourPalette): PatchImage {
  const raster = coreRasterizePatch(patchLump, colourPalette);
  const ctx = rasterImageToCanvas(raster);
  const { leftOffset, topOffset } = readPatchOffsets(patchLump);
  return {
    canvas: ctx.canvas,
    width: raster.width,
    height: raster.height,
    leftOffset,
    topOffset,
  };
}

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
