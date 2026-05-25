import type { ColourPalette } from '@/wad/interfaces/ColourPalette';
import type { SpriteTexture } from '@/wad/interfaces/SpriteTexture';

import { roundToPow2 } from '@/wad/utils/math';
import { drawPatch } from '@/wad/renderer/drawAssets/drawPatch';

export const drawSprite = (patchLump: ArrayBuffer, colourPalette: ColourPalette): SpriteTexture => {
  const patch = drawPatch(patchLump, colourPalette);

  //to get around the noop webgl texture limit with repeat and mipmaps, scale the texture to match the width and height and store a scale
  const resizedCanvas = document.createElement('canvas');
  const resizedContext = resizedCanvas.getContext('2d')!;

  resizedCanvas.width = resizedCanvas.height = roundToPow2(
    Math.max(patch.canvas.width, patch.canvas.height)
  );

  resizedContext.imageSmoothingEnabled = false;
  resizedContext.clearRect(0, 0, resizedCanvas.width, resizedCanvas.height);
  resizedContext.drawImage(patch.canvas, 0, 0, resizedCanvas.width, resizedCanvas.height);

  return {
    name: '',
    graphics: resizedContext,
    width: patch.canvas.width,
    height: patch.canvas.height,
  };
};
