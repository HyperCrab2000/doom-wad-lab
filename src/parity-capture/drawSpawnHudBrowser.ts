import type { Wad } from '@/wad/interfaces/Wad';
import { findWadLump } from '@/features/level-viewer/doomWadGraphics';
import { resolveStatusFaceLumpName } from '@/wad/game/statusFaceLumps';
import { rasterizePatchHudLut } from '@/wad/parity/raster/rasterizePatch';
import { rasterImageToCanvas } from '@/wad/adapters/rasterToCanvas';
import { drawSpawnHudAtBottom, type SpawnHudPatchImage } from '@/parity-capture/drawSpawnHudShared';
import { GZDOOM_SPAWN_HUD_PAL_LUT } from '@/parity-capture/gzdoomSpawnHudPalLut';

function patchImage(wad: Wad, lumpName: string): SpawnHudPatchImage | null {
  const lump = findWadLump(wad, lumpName);
  if (!lump) return null;

  const raster = rasterizePatchHudLut(lump, wad.playpal, GZDOOM_SPAWN_HUD_PAL_LUT);
  const ctx = rasterImageToCanvas(raster);
  const view = new DataView(lump);
  return {
    canvas: ctx.canvas,
    width: raster.width,
    height: raster.height,
    leftOffset: view.getInt16(4, true),
    topOffset: view.getInt16(6, true),
  };
}

/** GZDoom gold spawn HUD — pistol start defaults (browser canvas). */
export function drawSpawnHudBrowser(
  ctx: CanvasRenderingContext2D,
  wad: Wad,
  frameWidth: number,
  frameHeight: number,
): void {
  drawSpawnHudAtBottom(
    ctx,
    wad,
    frameWidth,
    frameHeight,
    patchImage,
    resolveStatusFaceLumpName(wad, 'STFSTF0'),
  );
}
