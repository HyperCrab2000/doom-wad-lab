import type { Wad } from '@/wad/interfaces/Wad';
import { computeHudLayout } from '@/features/level-viewer/doomHudLayout';
import {
  drawPatchAtAnchor,
  hudScreenToCanvas,
  VANILLA_HUD,
} from '@/features/level-viewer/doomStatusBarFonts';

export interface SpawnHudPatchImage {
  width: number;
  height: number;
  leftOffset: number;
  topOffset: number;
  canvas: HTMLCanvasElement | import('canvas').Canvas;
}

function drawPercentValueWithPatches(
  ctx: CanvasRenderingContext2D,
  patchImage: (wad: Wad, lumpName: string) => SpawnHudPatchImage | null,
  wad: Wad,
  value: number,
  screenX: number,
  screenY: number,
  barLeft: number,
  barY: number,
  scale: number,
): void {
  const anchor = hudScreenToCanvas(screenX, screenY, barLeft, barY, scale);
  const sample = patchImage(wad, 'STTNUM0');
  if (!sample) return;
  const digitW = sample.width * scale;
  let num = Math.max(0, Math.floor(value));
  let numdigits = 3;
  let x = anchor.x;
  while (num && numdigits--) {
    const digit = num % 10;
    const patch = patchImage(wad, `STTNUM${digit}`);
    if (patch) {
      x -= digitW;
      drawPatchAtAnchor(ctx, patch as never, x, anchor.y, scale);
    }
    num = Math.floor(num / 10);
  }
  if (Math.floor(value) === 0) {
    const zero = patchImage(wad, 'STTNUM0');
    if (zero) {
      x -= digitW;
      drawPatchAtAnchor(ctx, zero as never, x, anchor.y, scale);
    }
  }
  const percent = patchImage(wad, 'STTPRCNT');
  if (percent) {
    drawPatchAtAnchor(ctx, percent as never, anchor.x, anchor.y, scale);
  }
}

function drawShortNumberWithPatches(
  ctx: CanvasRenderingContext2D,
  patchImage: (wad: Wad, lumpName: string) => SpawnHudPatchImage | null,
  wad: Wad,
  value: number,
  screenX: number,
  screenY: number,
  barLeft: number,
  barY: number,
  scale: number,
  width = 3,
): void {
  const anchor = hudScreenToCanvas(screenX, screenY, barLeft, barY, scale);
  const sample = patchImage(wad, 'STYSNUM0');
  if (!sample) return;
  const digitW = sample.width * scale;
  let num = Math.max(0, Math.floor(value));
  let numdigits = width;
  let x = anchor.x;
  while (num && numdigits--) {
    const digit = num % 10;
    const patch = patchImage(wad, `STYSNUM${digit}`);
    if (patch) {
      x -= digitW;
      drawPatchAtAnchor(ctx, patch as never, x, anchor.y, scale);
    }
    num = Math.floor(num / 10);
  }
  if (Math.floor(value) === 0) {
    const zero = patchImage(wad, 'STYSNUM0');
    if (zero) {
      x -= digitW;
      drawPatchAtAnchor(ctx, zero as never, x, anchor.y, scale);
    }
  }
}

/** Bottom-anchored GZDoom spawn HUD (pistol start). */
export function drawSpawnHudAtBottom(
  ctx: CanvasRenderingContext2D,
  wad: Wad,
  frameWidth: number,
  frameHeight: number,
  patchImage: (wad: Wad, lumpName: string) => SpawnHudPatchImage | null,
  faceLumpName: string | null,
): void {
  const layout = computeHudLayout(frameWidth, frameHeight);
  const { barLeft, barY, scale } = layout;
  const hudTop = frameHeight - layout.canvasHeight;

  /** Fill face-rise + status band before ST* patches (transparent edges show through otherwise). */
  ctx.fillStyle = 'rgb(47, 47, 47)';
  ctx.fillRect(0, hudTop, frameWidth, layout.canvasHeight);

  ctx.save();
  ctx.translate(0, hudTop);

  const faceAnchor = hudScreenToCanvas(VANILLA_HUD.face.x, VANILLA_HUD.face.y, barLeft, barY, scale);
  const faceBack = patchImage(wad, 'STFB0');
  if (faceBack) {
    drawPatchAtAnchor(ctx, faceBack as never, faceAnchor.x, faceAnchor.y, scale);
  }

  const stbar = patchImage(wad, 'STBAR');
  if (stbar) {
    const barAnchor = hudScreenToCanvas(0, VANILLA_HUD.face.y, barLeft, barY, scale);
    drawPatchAtAnchor(ctx, stbar as never, barAnchor.x, barAnchor.y, scale);
  }

  if (faceLumpName) {
    const face = patchImage(wad, faceLumpName);
    if (face) {
      drawPatchAtAnchor(ctx, face as never, faceAnchor.x, faceAnchor.y, scale);
    }
  }

  drawPercentValueWithPatches(
    ctx,
    patchImage,
    wad,
    100,
    VANILLA_HUD.health.x,
    VANILLA_HUD.health.y,
    barLeft,
    barY,
    scale,
  );
  drawPercentValueWithPatches(
    ctx,
    patchImage,
    wad,
    0,
    VANILLA_HUD.armor.x,
    VANILLA_HUD.armor.y,
    barLeft,
    barY,
    scale,
  );
  drawShortNumberWithPatches(
    ctx,
    patchImage,
    wad,
    50,
    VANILLA_HUD.readyAmmo.x,
    VANILLA_HUD.readyAmmo.y,
    barLeft,
    barY,
    scale,
  );
  drawShortNumberWithPatches(
    ctx,
    patchImage,
    wad,
    50,
    VANILLA_HUD.ammo[0].x,
    VANILLA_HUD.ammo[0].y,
    barLeft,
    barY,
    scale,
  );
  drawShortNumberWithPatches(
    ctx,
    patchImage,
    wad,
    200,
    VANILLA_HUD.maxAmmo[0].x,
    VANILLA_HUD.maxAmmo[0].y,
    barLeft,
    barY,
    scale,
  );

  ctx.restore();
}
