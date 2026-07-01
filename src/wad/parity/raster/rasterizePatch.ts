import type { ColourPalette } from '@/wad/interfaces/ColourPalette';
import { ByteReader } from '@/wad/ByteReader/ByteReader';

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA8888 row-major; index 0 palette entries stay transparent (alpha 0). */
  rgba: Uint8Array;
}

/** Headless Doom patch raster — matches drawPatch.ts palette index 0. */
export function rasterizePatch(lump: ArrayBuffer, palette: ColourPalette): RasterImage {
  const patchData = new ByteReader(lump);
  const width = patchData.readUint16();
  const height = patchData.readUint16();
  patchData.skip(4);

  const rgba = new Uint8Array(width * height * 4);
  const colOffsets: number[] = [];
  for (let i = 0; i < width; i++) colOffsets.push(patchData.readUint32());

  for (let col = 0; col < colOffsets.length; col++) {
    patchData.setIndex(colOffsets[col]!);
    let yPos = 0;
    while (yPos < height) {
      const yOffset = patchData.readUint8();
      if (yOffset === 255) break;
      const numPixels = patchData.readUint8();
      patchData.skip(1);
      for (let j = 0; j < numPixels; j++) {
        const pixData = patchData.readUint8();
        const rgb = palette[pixData]!;
        const pixIndex = (col + (yOffset + j) * width) * 4;
        rgba[pixIndex] = rgb[0];
        rgba[pixIndex + 1] = rgb[1];
        rgba[pixIndex + 2] = rgb[2];
        rgba[pixIndex + 3] = 255;
      }
      patchData.skip(1);
      yPos = yOffset + numPixels;
    }
  }

  return { width, height, rgba };
}
