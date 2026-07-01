import type { Texture } from '@/wad/interfaces/Texture';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import type { Wad } from '@/wad/interfaces/Wad';
import { rasterizeTexture as coreRasterizeTexture } from '@hypercrab2000/doom-wad-core';

import { roundToPow2 } from '@/wad/utils/math';
import { getOrBuildPatch } from '@/wad/renderer/drawAssets/drawPatch';
import { rasterImageToCanvas } from '@/wad/adapters/rasterToCanvas';

const texturePixelsThreshold = 2;

export const drawTexture = (
  texture: Texture,
  wad: Wad,
  patchesByName: Record<string, CanvasRenderingContext2D>
): WallTexture => {
  // Warm patch cache for parity with prior canvas-based composition path.
  for (const patch of texture.patches) {
    const patchName = wad.pnames[patch.patchIndex];
    if (patchName) getOrBuildPatch(wad, patchesByName, patchName);
  }

  const raster = coreRasterizeTexture(texture, wad, wad.playpal);
  const textureContext = rasterImageToCanvas(raster);

  let transparentPixels = 0;
  const pixData = textureContext.getImageData(0, 0, raster.width, raster.height).data;
  for (let i = 3; i < pixData.length; i += 4) {
    if (pixData[i] === 0) transparentPixels++;
  }
  const transparent = transparentPixels >= texturePixelsThreshold;

  const resizedCanvas = document.createElement('canvas');
  const resizedContext = resizedCanvas.getContext('2d')!;
  resizedCanvas.width = resizedCanvas.height = roundToPow2(
    Math.max(raster.width, raster.height)
  );

  if (!transparent && transparentPixels) {
    resizedContext.fillStyle = 'black';
    resizedContext.fillRect(0, 0, resizedCanvas.width, resizedCanvas.height);
  }

  resizedContext.imageSmoothingEnabled = false;
  resizedContext.drawImage(textureContext.canvas, 0, 0, resizedCanvas.width, resizedCanvas.height);

  return {
    name: '',
    graphics: resizedContext,
    width: raster.width,
    height: raster.height,
    transparent,
  };
};
