export function getEmissiveColor(canvas: HTMLCanvasElement): [number, number, number] {
  const ctx = canvas.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (brightness > 192) { // pick threshold to favor "lit" pixels
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
  }

  if (count === 0) return [1, 1, 1]; // fallback
  return [r / count / 255, g / count / 255, b / count / 255];
}


export function getEmissiveHighlightColor(canvas: HTMLCanvasElement): [number, number, number] {
  const ctx = canvas.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let r = 0, g = 0, b = 0, brightPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness > 200) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      brightPixels++;
    }
  }

  return brightPixels
    ? [r / brightPixels / 255, g / brightPixels / 255, b / brightPixels / 255]
    : [0.2, 0.2, 0.2]; // fallback dim neutral
}

export function getLightTint(canvas: HTMLCanvasElement): [number, number, number] {
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const brightnessThreshold = 200;

  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < img.length; i += 4) {
    const br = (img[i] + img[i + 1] + img[i + 2]) / 3;
    if (br > brightnessThreshold) {
      r += img[i];
      g += img[i + 1];
      b += img[i + 2];
      count++;
    }
  }

  if (count === 0) return [1.0, 1.0, 1.0]; // fallback white
  return [r / count / 255, g / count / 255, b / count / 255];
}

