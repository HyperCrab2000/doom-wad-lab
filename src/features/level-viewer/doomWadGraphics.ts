import { drawPatch } from '@/wad/renderer/drawAssets/drawPatch';
import type { Wad } from '@/wad/interfaces/Wad';

export function findWadLump(wad: Wad, name: string): ArrayBuffer | undefined {
  if (wad.lumpHash[name]) return wad.lumpHash[name];
  const upper = name.toUpperCase();
  if (wad.lumpHash[upper]) return wad.lumpHash[upper];
  return undefined;
}

/** Standalone DOOM wordmark from the IWAD (no "The Ultimate" overlay). */
export const DOOM_LOGO_LUMP = 'M_DOOM';

export function drawDoomHeaderLogo(
  canvas: HTMLCanvasElement,
  wad: Wad,
  targetHeight = 48
): boolean {
  const data = findWadLump(wad, DOOM_LOGO_LUMP);
  if (!data) return false;

  const patch = drawPatch(data, wad.playpal);
  const srcH = patch.canvas.height;
  const srcW = patch.canvas.width;
  if (!srcH || !srcW) return false;

  const scale = targetHeight / srcH;
  canvas.width = Math.ceil(srcW * scale);
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(patch.canvas, 0, 0, canvas.width, canvas.height);
  return true;
}
