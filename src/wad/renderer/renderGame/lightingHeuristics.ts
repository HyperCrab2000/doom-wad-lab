import { SectorLine } from '@/wad/interfaces/SectorLine';
import { getFlatAmbientTint } from '@/wad/renderer/renderGame/sectorLighting';

export function getEmissiveColor(canvas: HTMLCanvasElement): [number, number, number] {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 16));
  const { data } = ctx.getImageData(0, 0, width, height);

  let r = 0, g = 0, b = 0, count = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const brightness = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (brightness > 192) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
    }
  }

  if (count === 0) return [1, 1, 1];
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
    : [0.2, 0.2, 0.2];
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

  if (count === 0) return [1.0, 1.0, 1.0];
  return [r / count / 255, g / count / 255, b / count / 255];
}

export function hasSkyWindow(
  sectorIndex: number,
  skySectorIndices: Set<number>,
  sectorLines: Record<number, SectorLine[]>
): boolean {
  const currentLines = sectorLines[sectorIndex] ?? [];

  for (const [otherIndexStr, otherLines] of Object.entries(sectorLines)) {
    const otherIndex = Number(otherIndexStr);
    if (otherIndex === sectorIndex || !skySectorIndices.has(otherIndex)) continue;

    for (const line of currentLines) {
      if (
        otherLines.some(
          (l) =>
            (l.v1 === line.v1 && l.v2 === line.v2) ||
            (l.v1 === line.v2 && l.v2 === line.v1)
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

export function boostEmissiveColor(
  name: string,
  baseColor: [number, number, number]
): [number, number, number] {
  return getFlatAmbientTint(name) ?? baseColor;
}
