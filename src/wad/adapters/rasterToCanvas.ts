import type { RasterImage } from '@hypercrab2000/doom-wad-core';

/** Convert headless RGBA raster from doom-wad-core into a 2D canvas context. */
export function rasterImageToCanvas(image: RasterImage): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D canvas context');
  const imgData = new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height);
  ctx.putImageData(imgData, 0, 0);
  return ctx;
}
