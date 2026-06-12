import { createCanvas, loadImage } from 'canvas';

export async function blackRatioFromPngBuffer(
  png: Buffer,
  grid = 10
): Promise<{ blackRatio: number; width: number; height: number; center: number[] }> {
  const img = await loadImage(png);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { blackRatio: 1, width: img.width, height: img.height, center: [0, 0, 0, 255] };
  }
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  let black = 0;
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x = Math.min(img.width - 1, Math.floor(((gx + 0.5) / grid) * img.width));
      const y = Math.min(img.height - 1, Math.floor(((gy + 0.5) / grid) * img.height));
      const i = (y * img.width + x) * 4;
      if (data[i]! <= 8 && data[i + 1]! <= 8 && data[i + 2]! <= 8) black++;
    }
  }
  const cx = img.width >> 1;
  const cy = img.height >> 1;
  const ci = (cy * img.width + cx) * 4;
  return {
    blackRatio: black / (grid * grid),
    width: img.width,
    height: img.height,
    center: [data[ci]!, data[ci + 1]!, data[ci + 2]!, data[ci + 3]!],
  };
}
