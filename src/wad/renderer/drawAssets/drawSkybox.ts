import { ColourPalette } from '@/wad/interfaces/ColourPalette';
import { ByteReader } from '@/wad/ByteReader/ByteReader';

export const drawSkyBox = (
  data: ArrayBuffer,
  colourPalette: ColourPalette,
  width: number = 256,
  height: number = 128
): CanvasRenderingContext2D => {
  const skyCanvas = document.createElement('canvas');
  const skyContext = skyCanvas.getContext('2d');

  if (!skyContext) {
    throw new Error('Could not create 2d canvas');
  }

  skyCanvas.width = width;
  skyCanvas.height = height;

  const skyData = new ByteReader(data);
  const size = width * height;
  const imgData = skyContext.getImageData(0, 0, width, height);
  const pixels = imgData.data;

  for (let i = 0, pix = 0; i < size; i++) {
    const pixData = skyData.readUint8();
    const rgb = colourPalette[pixData];

    pixels[pix++] = rgb[0];
    pixels[pix++] = rgb[1];
    pixels[pix++] = rgb[2];
    pixels[pix++] = 255;
  }

  skyContext.putImageData(imgData, 0, 0);
  return skyContext;
};
