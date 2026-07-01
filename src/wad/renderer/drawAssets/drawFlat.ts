import type { ColourPalette } from '@/wad/interfaces/ColourPalette';
import { rasterizeFlat as coreRasterizeFlat } from '@hypercrab2000/doom-wad-core';

import { rasterImageToCanvas } from '@/wad/adapters/rasterToCanvas';

export const drawFlat = (
  data: ArrayBuffer,
  colourPalette: ColourPalette
): CanvasRenderingContext2D => {
  return rasterImageToCanvas(coreRasterizeFlat(data, colourPalette));
};
