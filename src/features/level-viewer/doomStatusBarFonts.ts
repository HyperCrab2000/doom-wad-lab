import type { Wad } from '@/wad/interfaces/Wad';
import { drawPatchImage, type PatchImage } from '@/wad/renderer/drawAssets/drawPatch';
import { findWadLump } from '@/features/level-viewer/doomWadGraphics';

/** Screen Y of the top edge of STBAR in the original 320×200 status bar (st_stuff.c). */
export const VANILLA_STBAR_TOP_Y = 168;

/** Vanilla HUD widget positions (screen space, 320×200). */
export const VANILLA_HUD = {
  face: { x: 143, y: 168 },
  readyAmmo: { x: 44, y: 171 },
  health: { x: 90, y: 171 },
  armor: { x: 221, y: 171 },
  keys: [
    { x: 239, y: 171 },
    { x: 239, y: 181 },
    { x: 239, y: 191 },
  ],
  /** clip, shell, missile, cell — matches am_* order in Doom. */
  ammo: [
    { x: 288, y: 173 },
    { x: 288, y: 179 },
    { x: 288, y: 191 },
    { x: 288, y: 185 },
  ],
  maxAmmo: [
    { x: 314, y: 173 },
    { x: 314, y: 179 },
    { x: 314, y: 191 },
    { x: 314, y: 185 },
  ],
} as const;

export const KEY_CARD_LUMPS = ['STKEYS0', 'STKEYS1', 'STKEYS2'] as const;
export const FACE_BACK_LUMP = 'STFB0';

const tallDigitCache = new Map<string, PatchImage>();
const shortDigitCache = new Map<string, PatchImage>();

function cacheKey(wad: Wad, lump: string): string {
  return `${wad.lumpInfo.length}:${lump}`;
}

function loadPatch(wad: Wad, lump: string, cache: Map<string, PatchImage>): PatchImage | null {
  const key = cacheKey(wad, lump);
  if (cache.has(key)) return cache.get(key)!;
  const data = findWadLump(wad, lump);
  if (!data) return null;
  const patch = drawPatchImage(data, wad.playpal);
  cache.set(key, patch);
  return patch;
}

function getTallDigit(wad: Wad, digit: number): PatchImage | null {
  return loadPatch(wad, `STTNUM${digit}`, tallDigitCache);
}

function getShortDigit(wad: Wad, digit: number): PatchImage | null {
  return loadPatch(wad, `STYSNUM${digit}`, shortDigitCache);
}

function getPercentPatch(wad: Wad): PatchImage | null {
  return loadPatch(wad, 'STTPRCNT', tallDigitCache);
}

/** Map vanilla screen coords into the letterboxed HUD canvas. */
export function hudScreenToCanvas(
  screenX: number,
  screenY: number,
  barLeft: number,
  barY: number,
  scale: number
): { x: number; y: number } {
  return {
    x: barLeft + Math.round(screenX * scale),
    y: barY + Math.round((screenY - VANILLA_STBAR_TOP_Y) * scale),
  };
}

/** V_DrawPatch anchor: (x,y) is the logical origin, not the bitmap top-left. */
export function drawPatchAtAnchor(
  ctx: CanvasRenderingContext2D,
  patch: PatchImage,
  anchorX: number,
  anchorY: number,
  scale: number
): void {
  const x = Math.round(anchorX - patch.leftOffset * scale);
  const y = Math.round(anchorY - patch.topOffset * scale);
  const w = patch.width * scale;
  const h = patch.height * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(patch.canvas, x, y, w, h);
}

/** Tall red number + percent sign (health / armor), right-aligned like st_lib.c. */
export function drawStPercentValue(
  ctx: CanvasRenderingContext2D,
  wad: Wad,
  value: number,
  screenX: number,
  screenY: number,
  barLeft: number,
  barY: number,
  scale: number
): boolean {
  const anchor = hudScreenToCanvas(screenX, screenY, barLeft, barY, scale);
  const sample = getTallDigit(wad, 0);
  if (!sample) return false;
  const digitW = sample.width * scale;

  let num = Math.max(0, Math.floor(value));
  let numdigits = 3;
  let x = anchor.x;

  while (num && numdigits--) {
    const digit = num % 10;
    const patch = getTallDigit(wad, digit);
    if (patch) {
      x -= digitW;
      drawPatchAtAnchor(ctx, patch, x, anchor.y, scale);
    }
    num = Math.floor(num / 10);
  }

  if (Math.floor(value) === 0) {
    const zero = getTallDigit(wad, 0);
    if (zero) {
      x -= digitW;
      drawPatchAtAnchor(ctx, zero, x, anchor.y, scale);
    }
  }

  const percent = getPercentPatch(wad);
  if (percent) {
    drawPatchAtAnchor(ctx, percent, anchor.x, anchor.y, scale);
  }

  return true;
}

/** Short yellow ammo digits (fixed width, right-aligned), matches STlib_drawNum. */
export function drawStShortNumber(
  ctx: CanvasRenderingContext2D,
  wad: Wad,
  value: number,
  screenX: number,
  screenY: number,
  barLeft: number,
  barY: number,
  scale: number,
  width = 3
): boolean {
  const anchor = hudScreenToCanvas(screenX, screenY, barLeft, barY, scale);
  const sample = getShortDigit(wad, 0);
  if (!sample) return false;
  const digitW = sample.width * scale;

  let num = Math.max(0, Math.floor(value));
  let numdigits = width;
  let x = anchor.x;

  while (num && numdigits--) {
    const digit = num % 10;
    const patch = getShortDigit(wad, digit);
    if (patch) {
      x -= digitW;
      drawPatchAtAnchor(ctx, patch, x, anchor.y, scale);
    }
    num = Math.floor(num / 10);
  }

  if (Math.floor(value) === 0) {
    const zero = getShortDigit(wad, 0);
    if (zero) {
      x -= digitW;
      drawPatchAtAnchor(ctx, zero, x, anchor.y, scale);
    }
  }

  return true;
}

export function drawKeyCard(
  ctx: CanvasRenderingContext2D,
  wad: Wad,
  keyIndex: 0 | 1 | 2,
  screenX: number,
  screenY: number,
  barLeft: number,
  barY: number,
  scale: number
): boolean {
  const lump = KEY_CARD_LUMPS[keyIndex];
  const data = findWadLump(wad, lump);
  if (!data) return false;
  const patch = drawPatchImage(data, wad.playpal);
  const anchor = hudScreenToCanvas(screenX, screenY, barLeft, barY, scale);
  drawPatchAtAnchor(ctx, patch, anchor.x, anchor.y, scale);
  return true;
}

export function drawFaceBack(
  ctx: CanvasRenderingContext2D,
  wad: Wad,
  screenX: number,
  screenY: number,
  barLeft: number,
  barY: number,
  scale: number
): boolean {
  const data = findWadLump(wad, FACE_BACK_LUMP);
  if (!data) return false;
  const patch = drawPatchImage(data, wad.playpal);
  const anchor = hudScreenToCanvas(screenX, screenY, barLeft, barY, scale);
  drawPatchAtAnchor(ctx, patch, anchor.x, anchor.y, scale);
  return true;
}
