import type { ColourPalette } from '@/wad/interfaces/ColourPalette';
import { flatSize } from '@/wad/constants/WadInfo';
import { ByteReader } from '@/wad/ByteReader/ByteReader';

import type { RasterImage } from './rasterizePatch';

/** Headless 64×64 flat raster — matches drawFlat.ts. */
export function rasterizeFlat(lump: ArrayBuffer, palette: ColourPalette): RasterImage {
  const flatData = new ByteReader(lump);
  const rgba = new Uint8Array(flatSize * flatSize * 4);
  const size = flatSize * flatSize;

  for (let i = 0, pix = 0; i < size; i++) {
    const pixData = flatData.readUint8();
    const rgb = palette[pixData]!;
    rgba[pix++] = rgb[0];
    rgba[pix++] = rgb[1];
    rgba[pix++] = rgb[2];
    rgba[pix++] = 255;
  }

  return { width: flatSize, height: flatSize, rgba };
}
