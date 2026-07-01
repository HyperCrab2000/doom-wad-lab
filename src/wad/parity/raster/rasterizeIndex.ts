import type { ColourPalette } from '@/wad/interfaces/ColourPalette';
import type { Texture } from '@/wad/interfaces/Texture';
import type { Wad } from '@/wad/interfaces/Wad';
import { flatSize } from '@/wad/constants/WadInfo';
import { ByteReader } from '@/wad/ByteReader/ByteReader';
import type { RasterImage } from '@hypercrab2000/doom-wad-core';

/** Palette index in R, opacity in A — for colormap LUT shading. */
export function rasterizePatchIndex(lump: ArrayBuffer): RasterImage {
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
        const pixIndex = (col + (yOffset + j) * width) * 4;
        rgba[pixIndex] = pixData;
        rgba[pixIndex + 3] = pixData === 0 ? 0 : 255;
      }
      patchData.skip(1);
      yPos = yOffset + numPixels;
    }
  }

  return { width, height, rgba };
}

export function rasterizeFlatIndex(lump: ArrayBuffer): RasterImage {
  const flatData = new ByteReader(lump);
  const rgba = new Uint8Array(flatSize * flatSize * 4);
  const size = flatSize * flatSize;

  for (let i = 0, pix = 0; i < size; i++) {
    const pixData = flatData.readUint8();
    rgba[pix++] = pixData;
    rgba[pix++] = 0;
    rgba[pix++] = 0;
    rgba[pix++] = 255;
  }

  return { width: flatSize, height: flatSize, rgba };
}

function blitPatchIndex(
  target: Uint8Array,
  targetWidth: number,
  targetHeight: number,
  patch: RasterImage,
  originX: number,
  originY: number,
): void {
  for (let y = 0; y < patch.height; y++) {
    for (let x = 0; x < patch.width; x++) {
      const dstX = originX + x;
      const dstY = originY + y;
      if (dstX < 0 || dstY < 0 || dstX >= targetWidth || dstY >= targetHeight) continue;
      const src = (y * patch.width + x) * 4;
      if (patch.rgba[src + 3] === 0) continue;
      const dst = (dstY * targetWidth + dstX) * 4;
      target[dst] = patch.rgba[src]!;
      target[dst + 1] = 0;
      target[dst + 2] = 0;
      target[dst + 3] = patch.rgba[src + 3]!;
    }
  }
}

export function rasterizeTextureIndex(texture: Texture, wad: Wad): RasterImage {
  const width = texture.texWidth;
  const height = texture.texHeight;
  const rgba = new Uint8Array(width * height * 4);
  const patchCache = new Map<string, RasterImage>();

  for (const patch of texture.patches) {
    const patchName = wad.pnames[patch.patchIndex];
    if (!patchName) continue;
    let cached = patchCache.get(patchName);
    if (!cached) {
      const lump = wad.lumpHash[patchName] ?? wad.sprites[patchName];
      if (!lump) continue;
      cached = rasterizePatchIndex(lump);
      patchCache.set(patchName, cached);
    }
    blitPatchIndex(rgba, width, height, cached, patch.originX, patch.originY);
  }

  let transparentPixels = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 0) transparentPixels++;
  }
  if (transparentPixels >= 2 && transparentPixels < width * height) {
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = 255;
    }
    for (const patch of texture.patches) {
      const patchName = wad.pnames[patch.patchIndex];
      if (!patchName) continue;
      const cached = patchCache.get(patchName);
      if (!cached) continue;
      blitPatchIndex(rgba, width, height, cached, patch.originX, patch.originY);
    }
  }

  return { width, height, rgba };
}

export function uploadIndexRasterTexture(
  gl: WebGL2RenderingContext,
  raster: RasterImage,
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    raster.width,
    raster.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    raster.rgba,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}
