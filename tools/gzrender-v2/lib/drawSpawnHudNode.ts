import { createCanvas, type CanvasRenderingContext2D } from 'canvas';

import type { Wad } from '@/wad/interfaces/Wad';
import { computeHudLayout } from '@/features/level-viewer/doomHudLayout';
import {
  drawFaceBack,
  drawPatchAtAnchor,
  drawStPercentValue,
  drawStShortNumber,
  VANILLA_HUD,
} from '@/features/level-viewer/doomStatusBarFonts';
import { findWadLump } from '@/features/level-viewer/doomWadGraphics';
import { resolveStatusFaceLumpName } from '@/wad/game/statusFaceLumps';
import { rasterizePatch } from '@/wad/parity/raster/rasterizePatch';

function patchImage(wad: Wad, lumpName: string) {
  const lump = findWadLump(wad, lumpName);
  if (!lump) return null;
  const raster = rasterizePatch(lump, wad.playpal);
  const canvas = createCanvas(raster.width, raster.height);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(raster.width, raster.height);
  img.data.set(raster.rgba);
  ctx.putImageData(img, 0, 0);
  const view = new DataView(lump);
  return {
    canvas,
    width: raster.width,
    height: raster.height,
    leftOffset: view.getInt16(4, true),
    topOffset: view.getInt16(6, true),
  };
}

/** GZDoom gold spawn HUD — pistol start, no keys, default face. */
export function drawSpawnHudNode(
  ctx: CanvasRenderingContext2D,
  wad: Wad,
  frameWidth: number,
  frameHeight: number,
): void {
  const layout = computeHudLayout(frameWidth, frameHeight);
  const { barLeft, barY, scale } = layout;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, frameHeight - layout.statusBandPx, frameWidth, layout.statusBandPx);

  const stbar = patchImage(wad, 'STBAR');
  if (stbar) {
    drawPatchAtAnchor(ctx, stbar as never, barLeft, barY, scale);
  }

  drawFaceBack(ctx, wad, VANILLA_HUD.face.x, VANILLA_HUD.face.y, barLeft, barY, scale);
  const faceName = resolveStatusFaceLumpName(wad, 'STFSTF0');
  if (faceName) {
    const face = patchImage(wad, faceName);
    if (face) {
      drawPatchAtAnchor(ctx, face as never, barLeft + VANILLA_HUD.face.x * scale, barY, scale);
    }
  }

  drawStPercentValue(ctx, wad, 100, VANILLA_HUD.health.x, VANILLA_HUD.health.y, barLeft, barY, scale);
  drawStPercentValue(ctx, wad, 0, VANILLA_HUD.armor.x, VANILLA_HUD.armor.y, barLeft, barY, scale);
  drawStShortNumber(
    ctx,
    wad,
    50,
    VANILLA_HUD.readyAmmo.x,
    VANILLA_HUD.readyAmmo.y,
    barLeft,
    barY,
    scale,
  );
}
