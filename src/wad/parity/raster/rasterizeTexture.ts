import type { ColourPalette } from '@/wad/interfaces/ColourPalette';
import type { Texture } from '@/wad/interfaces/Texture';
import type { Wad } from '@/wad/interfaces/Wad';

import type { RasterImage } from './rasterizePatch';
import { rasterizePatch } from './rasterizePatch';

const texturePixelsThreshold = 2;

function blitPatch(
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
      target[dst + 1] = patch.rgba[src + 1]!;
      target[dst + 2] = patch.rgba[src + 2]!;
      target[dst + 3] = patch.rgba[src + 3]!;
    }
  }
}

/** Compose wall texture at native size — matches drawTexture.ts (without pow2 resize). */
export function rasterizeTexture(texture: Texture, wad: Wad, palette: ColourPalette): RasterImage {
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
      cached = rasterizePatch(lump, palette);
      patchCache.set(patchName, cached);
    }
    blitPatch(rgba, width, height, cached, patch.originX, patch.originY);
  }

  let transparentPixels = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 0) transparentPixels++;
  }
  const transparent = transparentPixels >= texturePixelsThreshold;
  if (!transparent && transparentPixels > 0) {
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
      blitPatch(rgba, width, height, cached, patch.originX, patch.originY);
    }
  }

  return { width, height, rgba };
}
