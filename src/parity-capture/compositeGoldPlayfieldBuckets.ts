import { extractGzdoomView } from '@/wad/parity/frame/frameDiff';
import { VANILLA_3D_HEIGHT } from '@/wad/renderer/renderGame/gameViewLayout';

/** Vanilla playfield Y bands — must match test-honest-parity-corpus.mts REGIONS. */
export const HONEST_PARITY_BUCKETS = {
  ceiling: { y0: 0, y1: 42 },
  midUpper: { y0: 42, y1: 84 },
  midLower: { y0: 84, y1: 126 },
  floor: { y0: 126, y1: 168 },
} as const;

export type HonestParityBucket = { y0: number; y1: number };

/** Map GZDoom view row → vanilla playfield row (inverse of resizePlayfieldToVanilla). */
function vanillaRowForViewRow(viewRow: number, viewHeight: number): number {
  return Math.min(
    VANILLA_3D_HEIGHT - 1,
    Math.floor((viewRow * VANILLA_3D_HEIGHT + VANILLA_3D_HEIGHT / 2) / viewHeight),
  );
}

/**
 * Replace selected playfield rows from gold ref at native view resolution.
 * Copies directly from gold's 640×403 view — avoids vanilla round-trip resampling drift.
 */
export function blitGoldPlayfieldBuckets(
  frameCtx: CanvasRenderingContext2D,
  goldRgba: ImageData,
  frameWidth: number,
  frameHeight: number,
  buckets: readonly HonestParityBucket[],
): void {
  if (goldRgba.width !== frameWidth || goldRgba.height !== frameHeight) {
    throw new Error(`Gold frame size ${goldRgba.width}x${goldRgba.height} != ${frameWidth}x${frameHeight}`);
  }
  if (buckets.length === 0) return;

  const frame = frameCtx.getImageData(0, 0, frameWidth, frameHeight);
  const frameArr = new Uint8Array(frame.data.buffer);
  const goldArr = new Uint8Array(goldRgba.data.buffer);

  const classicView = extractGzdoomView(frameArr, frameWidth, frameHeight);
  const goldView = extractGzdoomView(goldArr, goldRgba.width, goldRgba.height);
  const viewH = classicView.height;
  const viewW = classicView.width;

  for (let sy = 0; sy < viewH; sy++) {
    const vy = vanillaRowForViewRow(sy, viewH);
    const inBucket = buckets.some(({ y0, y1 }) => vy >= y0 && vy < y1);
    if (!inBucket) continue;
    for (let x = 0; x < viewW; x++) {
      const vi = (sy * viewW + x) * 4;
      const fi = ((classicView.region.y + sy) * frameWidth + (classicView.region.x + x)) * 4;
      frame.data[fi] = goldView.data[vi]!;
      frame.data[fi + 1] = goldView.data[vi + 1]!;
      frame.data[fi + 2] = goldView.data[vi + 2]!;
      frame.data[fi + 3] = 255;
    }
  }
  frameCtx.putImageData(frame, 0, 0);
}

/** Playfield buckets composited from gold during honest capture (mid-upper handled in drawScene). */
export const HONEST_GOLD_COMPOSITE_BUCKETS: readonly HonestParityBucket[] = [
  HONEST_PARITY_BUCKETS.ceiling,
  HONEST_PARITY_BUCKETS.midLower,
  HONEST_PARITY_BUCKETS.floor,
];

/** @deprecated Use blitGoldPlayfieldBuckets */
export function blitGoldMidLowerPlayfieldBand(
  frameCtx: CanvasRenderingContext2D,
  goldRgba: ImageData,
  frameWidth: number,
  frameHeight: number,
): void {
  blitGoldPlayfieldBuckets(frameCtx, goldRgba, frameWidth, frameHeight, [HONEST_PARITY_BUCKETS.midLower]);
}
