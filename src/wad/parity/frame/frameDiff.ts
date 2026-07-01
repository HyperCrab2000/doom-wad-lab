import { createCanvas, loadImage, type Canvas, type CanvasRenderingContext2D } from 'canvas';

import {
  VANILLA_3D_HEIGHT,
  VANILLA_SCREEN_HEIGHT,
  VANILLA_SCREEN_WIDTH,
} from '@/wad/renderer/renderGame/gameViewLayout';

export const VANILLA_PLAYFIELD_WIDTH = VANILLA_SCREEN_WIDTH;
export const VANILLA_PLAYFIELD_HEIGHT = VANILLA_3D_HEIGHT;

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

/** `gzdoom-view` = top 168/200 of frame (screenblocks 10, no status overlay). */
export type FrameDiffLayout = 'vanilla-playfield' | 'full-frame' | 'gzdoom-view';

export interface FrameDiffOptions {
  tolerance?: number;
  /** Pass when mismatchedPixels ≤ this budget (edge-tier gate; strict = omit). */
  maxMismatchedPixels?: number;
  region?: FrameDiffRegion;
  layout?: FrameDiffLayout;
  /**
   * Colormap-band-exact tolerance. When > 0, a pixel that differs is NOT counted as a mismatch
   * if the right (WASM) color exactly matches some left (native) pixel within this Chebyshev
   * radius. Along Doom's distance light-fade, adjacent colormap rows occupy spatially adjacent
   * pixels, so a row boundary that shifts by ≤radius px (irreducible GPU floor() ULP noise across
   * two different GLES→Metal shader compilers) is forgiven; genuine shading differences are not.
   */
  boundaryToleranceRadius?: number;
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

export function fullFrameRegion(imageWidth: number, imageHeight: number): FrameDiffRegion {
  return { x: 0, y: 0, width: imageWidth, height: imageHeight };
}

/** GZDoom screenblocks 10: 3D view occupies top 168/200 of framebuffer. */
export function gzdoomViewRegion(imageWidth: number, imageHeight: number): FrameDiffRegion {
  const scale = Math.max(1, Math.floor(imageWidth / VANILLA_SCREEN_WIDTH));
  const width = VANILLA_SCREEN_WIDTH * scale;
  const height = Math.round((imageHeight * VANILLA_3D_HEIGHT) / VANILLA_SCREEN_HEIGHT);
  const offsetX = Math.round((imageWidth - width) / 2);
  return { x: offsetX, y: 0, width, height };
}

/** Vanilla playfield crop: 320×168 3D view, centered in a 320×200 frame (matches gameViewLayout). */
export function doomPlayfieldRegion(
  imageWidth: number,
  imageHeight: number,
  scale = Math.max(1, Math.floor(imageWidth / VANILLA_SCREEN_WIDTH)),
): FrameDiffRegion {
  const width = VANILLA_SCREEN_WIDTH * scale;
  const height = VANILLA_3D_HEIGHT * scale;
  const offsetX = Math.round((imageWidth - width) / 2);
  const frameHeight = VANILLA_SCREEN_HEIGHT * scale;
  const offsetY = Math.max(0, Math.round((imageHeight - frameHeight) / 2));
  return { x: offsetX, y: offsetY, width, height };
}

/** True if right(x,y) matches some left pixel within Chebyshev `radius` (≤ tolerance per channel). */
function matchesWithinRadius(
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  tolerance: number,
): boolean {
  const i = (y * width + x) * 4;
  const r = right[i]!, g = right[i + 1]!, b = right[i + 2]!;
  for (let dy = -radius; dy <= radius; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      const j = (ny * width + nx) * 4;
      if (
        Math.abs(left[j]! - r) <= tolerance &&
        Math.abs(left[j + 1]! - g) <= tolerance &&
        Math.abs(left[j + 2]! - b) <= tolerance
      ) {
        return true;
      }
    }
  }
  return false;
}

export function diffRgbaBuffers(
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
  width: number,
  height: number,
  region: FrameDiffRegion,
  tolerance = 0,
  maxMismatchedPixels?: number,
  boundaryToleranceRadius = 0,
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
      if (delta <= tolerance) continue;
      if (
        boundaryToleranceRadius > 0 &&
        matchesWithinRadius(left, right, width, height, srcX, srcY, boundaryToleranceRadius, tolerance)
      ) {
        continue;
      }
      mismatchedPixels++;
    }
  }

  const mismatchRatio = comparedPixels === 0 ? 1 : mismatchedPixels / comparedPixels;
  const withinEdgeBudget =
    maxMismatchedPixels != null && mismatchedPixels > 0 && mismatchedPixels <= maxMismatchedPixels;
  return {
    width: region.width,
    height: region.height,
    comparedPixels,
    mismatchedPixels,
    mismatchRatio,
    meanAbsDelta: comparedPixels === 0 ? 255 : absSum / (comparedPixels * 3),
    maxChannelDelta: maxDelta,
    identical: mismatchedPixels === 0 || withinEdgeBudget,
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
  // Inverse of GZRender_ProbePlayfieldPixel / GetScreenshotBuffer center sampling (gles_framebuffer.cpp).
  const outW = VANILLA_PLAYFIELD_WIDTH;
  const outH = VANILLA_PLAYFIELD_HEIGHT;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height + outH / 2) / outH));
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width + width / (outW * 2)) / outW));
      const si = (sy * width + sx) * 4;
      const di = (y * outW + x) * 4;
      out[di] = data[si]!;
      out[di + 1] = data[si + 1]!;
      out[di + 2] = data[si + 2]!;
      out[di + 3] = data[si + 3]!;
    }
  }
  return { width: outW, height: outH, data: out };
}

function resolveFrameDiffLayout(
  leftW: number,
  leftH: number,
  rightW: number,
  rightH: number,
  layout: FrameDiffLayout | undefined,
): FrameDiffLayout {
  if (layout) return layout;
  if (leftW === rightW && leftH === rightH && leftW >= 640 && leftH >= 480) {
    return 'gzdoom-view';
  }
  return 'vanilla-playfield';
}

export function extractGzdoomView(
  data: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
): { width: number; height: number; data: Uint8ClampedArray; region: FrameDiffRegion } {
  const region = gzdoomViewRegion(imageWidth, imageHeight);
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

export async function diffPlayfieldPngFiles(
  leftPath: string,
  rightPath: string,
  options: FrameDiffOptions = {},
): Promise<FrameDiffResult & { leftSize: string; rightSize: string; layout: FrameDiffLayout }> {
  const left = await loadPng(leftPath);
  const right = await loadPng(rightPath);
  const layout = resolveFrameDiffLayout(left.width, left.height, right.width, right.height, options.layout);

  if (layout === 'full-frame' || layout === 'gzdoom-view') {
    if (left.width !== right.width || left.height !== right.height) {
      throw new Error(`frame diff requires matching dimensions (${left.width}x${left.height} vs ${right.width}x${right.height})`);
    }
    const leftView = layout === 'gzdoom-view'
      ? extractGzdoomView(left.data, left.width, left.height)
      : { width: left.width, height: left.height, data: left.data, region: fullFrameRegion(left.width, left.height) };
    const rightView = layout === 'gzdoom-view'
      ? extractGzdoomView(right.data, right.width, right.height)
      : { width: right.width, height: right.height, data: right.data, region: fullFrameRegion(right.width, right.height) };
    const leftNorm = resizePlayfieldToVanilla(leftView.data, leftView.width, leftView.height);
    const rightNorm = resizePlayfieldToVanilla(rightView.data, rightView.width, rightView.height);
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
      options.maxMismatchedPixels,
      options.boundaryToleranceRadius ?? 0,
    );
    return {
      ...result,
      leftSize: `${left.width}x${left.height}`,
      rightSize: `${right.width}x${right.height}`,
      layout,
    };
  }

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
    options.maxMismatchedPixels,
    options.boundaryToleranceRadius ?? 0,
  );
  return {
    ...result,
    leftSize: `${left.width}x${left.height}`,
    rightSize: `${right.width}x${right.height}`,
    layout,
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
