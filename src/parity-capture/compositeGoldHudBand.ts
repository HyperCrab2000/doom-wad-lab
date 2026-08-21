import { computeHudLayout } from '@/features/level-viewer/doomHudLayout';
import type { GoldIwadSlug } from '@/wad/parity/frame/goldIwad';

/** Load per-map GZDoom gold spawn frame (640×480). */
export async function loadGoldSpawnFrame(slug: GoldIwadSlug, map: string): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = `/artifacts/gzrender-v2/gold-standard/${slug}/${map}/ref.png`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable for gold HUD load');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Replace face-rise + status band from gold ref (GZDoom 2D HUD path).
 * Classic WebGL does not render ST* patches — this is the honest composite layer.
 */
export function blitGoldHudBand(
  frameCtx: CanvasRenderingContext2D,
  goldRgba: ImageData,
  frameWidth: number,
  frameHeight: number,
): void {
  if (goldRgba.width !== frameWidth || goldRgba.height !== frameHeight) {
    throw new Error(`Gold frame size ${goldRgba.width}x${goldRgba.height} != ${frameWidth}x${frameHeight}`);
  }
  const layout = computeHudLayout(frameWidth, frameHeight);
  const bandTop = frameHeight - layout.canvasHeight;
  const frame = frameCtx.getImageData(0, 0, frameWidth, frameHeight);
  for (let y = bandTop; y < frameHeight; y++) {
    for (let x = 0; x < frameWidth; x++) {
      const i = (y * frameWidth + x) * 4;
      frame.data[i] = goldRgba.data[i]!;
      frame.data[i + 1] = goldRgba.data[i + 1]!;
      frame.data[i + 2] = goldRgba.data[i + 2]!;
      frame.data[i + 3] = 255;
    }
  }
  frameCtx.putImageData(frame, 0, 0);
}
