import { createCanvas, loadImage, type Canvas, type CanvasRenderingContext2D } from 'canvas';

export const VANILLA_PLAYFIELD_WIDTH = 320;
export const VANILLA_PLAYFIELD_HEIGHT = 168;

export interface FrameDiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameDiffResult {
  width: number;
  height: number;
  comparedPixels: number;
  mismatchedPixels: number;
  mismatchRatio: number;
  meanAbsDelta: number;
  maxChannelDelta: number;
  identical: boolean;
}

export interface FrameDiffOptions {
  tolerance?: number;
  region?: FrameDiffRegion;
}

function readRgba(ctx: CanvasRenderingContext2D, w: number, h: number): Uint8ClampedArray {
  return ctx.getImageData(0, 0, w, h).data;
}

export async function loadPng(path: string): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const img = await loadImage(path);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.drawImage(img, 0, 0);
  return { width: img.width, height: img.height, data: readRgba(ctx, img.width, img.height) };
}

/** Vanilla playfield crop: 320×168 3D view, centered in a 320×200 frame (matches gameViewLayout). */
export function doomPlayfieldRegion(
  imageWidth: number,
  imageHeight: number,
  scale = Math.max(1, Math.floor(imageWidth / 320)),
): FrameDiffRegion {
  const width = 320 * scale;
  const height = 168 * scale;
  const offsetX = Math.round((imageWidth - width) / 2);
  const frameHeight = 200 * scale;
  const offsetY = Math.max(0, Math.round((imageHeight - frameHeight) / 2));
  return { x: offsetX, y: offsetY, width, height };
}

export function diffRgbaBuffers(
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
  width: number,
  height: number,
  region: FrameDiffRegion,
  tolerance = 0,
): FrameDiffResult {
  if (left.length !== right.length) {
    throw new Error(`buffer size mismatch: ${left.length} vs ${right.length}`);
  }

  let mismatchedPixels = 0;
  let absSum = 0;
  let maxDelta = 0;
  let comparedPixels = 0;

  for (let y = 0; y < region.height; y++) {
    const srcY = region.y + y;
    for (let x = 0; x < region.width; x++) {
      const srcX = region.x + x;
      const i = (srcY * width + srcX) * 4;
      const dr = Math.abs(left[i]! - right[i]!);
      const dg = Math.abs(left[i + 1]! - right[i + 1]!);
      const db = Math.abs(left[i + 2]! - right[i + 2]!);
      const delta = Math.max(dr, dg, db);
      absSum += dr + dg + db;
      maxDelta = Math.max(maxDelta, delta);
      comparedPixels++;
      if (delta > tolerance) mismatchedPixels++;
    }
  }

  const mismatchRatio = comparedPixels === 0 ? 1 : mismatchedPixels / comparedPixels;
  return {
    width: region.width,
    height: region.height,
    comparedPixels,
    mismatchedPixels,
    mismatchRatio,
    meanAbsDelta: comparedPixels === 0 ? 255 : absSum / (comparedPixels * 3),
    maxChannelDelta: maxDelta,
    identical: mismatchedPixels === 0,
  };
}

export function extractPlayfield(
  data: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
): { width: number; height: number; data: Uint8ClampedArray; region: FrameDiffRegion } {
  const region = doomPlayfieldRegion(imageWidth, imageHeight);
  const out = new Uint8ClampedArray(region.width * region.height * 4);
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const src = ((region.y + y) * imageWidth + (region.x + x)) * 4;
      const dst = (y * region.width + x) * 4;
      out[dst] = data[src]!;
      out[dst + 1] = data[src + 1]!;
      out[dst + 2] = data[src + 2]!;
      out[dst + 3] = data[src + 3]!;
    }
  }
  return { width: region.width, height: region.height, data: out, region };
}

export function resizePlayfieldToVanilla(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { width: number; height: number; data: Uint8ClampedArray } {
  const src = createCanvas(width, height);
  const srcCtx = src.getContext('2d');
  if (!srcCtx) throw new Error('canvas 2d unavailable');
  const imageData = srcCtx.createImageData(width, height);
  imageData.data.set(data);
  srcCtx.putImageData(imageData, 0, 0);

  const dst = createCanvas(VANILLA_PLAYFIELD_WIDTH, VANILLA_PLAYFIELD_HEIGHT);
  const dstCtx = dst.getContext('2d');
  if (!dstCtx) throw new Error('canvas 2d unavailable');
  dstCtx.imageSmoothingEnabled = false;
  dstCtx.drawImage(src as unknown as Canvas, 0, 0, VANILLA_PLAYFIELD_WIDTH, VANILLA_PLAYFIELD_HEIGHT);
  return {
    width: VANILLA_PLAYFIELD_WIDTH,
    height: VANILLA_PLAYFIELD_HEIGHT,
    data: readRgba(dstCtx, VANILLA_PLAYFIELD_WIDTH, VANILLA_PLAYFIELD_HEIGHT),
  };
}

export async function diffPlayfieldPngFiles(
  leftPath: string,
  rightPath: string,
  options: FrameDiffOptions = {},
): Promise<FrameDiffResult & { leftSize: string; rightSize: string }> {
  const left = await loadPng(leftPath);
  const right = await loadPng(rightPath);
  const leftPf = extractPlayfield(left.data, left.width, left.height);
  const rightPf = extractPlayfield(right.data, right.width, right.height);
  const leftNorm = resizePlayfieldToVanilla(leftPf.data, leftPf.width, leftPf.height);
  const rightNorm = resizePlayfieldToVanilla(rightPf.data, rightPf.width, rightPf.height);

  const region = options.region ?? {
    x: 0,
    y: 0,
    width: VANILLA_PLAYFIELD_WIDTH,
    height: VANILLA_PLAYFIELD_HEIGHT,
  };
  const result = diffRgbaBuffers(
    leftNorm.data,
    rightNorm.data,
    leftNorm.width,
    leftNorm.height,
    region,
    options.tolerance ?? 0,
  );
  return {
    ...result,
    leftSize: `${left.width}x${left.height}`,
    rightSize: `${right.width}x${right.height}`,
  };
}

export async function diffPngFiles(
  leftPath: string,
  rightPath: string,
  options: FrameDiffOptions = {},
): Promise<FrameDiffResult> {
  return diffPlayfieldPngFiles(leftPath, rightPath, options);
}

export function formatFrameDiff(result: FrameDiffResult): string {
  const pct = (result.mismatchRatio * 100).toFixed(2);
  return [
    `compared ${result.width}x${result.height} (${result.comparedPixels} px)`,
    `mismatch ${result.mismatchedPixels} (${pct}%)`,
    `meanAbsDelta ${result.meanAbsDelta.toFixed(2)}`,
    `maxChannelDelta ${result.maxChannelDelta}`,
    result.identical ? 'IDENTICAL' : 'DIFFER',
  ].join(' | ');
}
