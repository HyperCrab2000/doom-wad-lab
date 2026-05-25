import { drawPatch } from '@/wad/renderer/drawAssets/drawPatch';
import type { Wad } from '@/wad/interfaces/Wad';
import { findWadLump } from './doomWadGraphics';

/** Vanilla TITLEPIC resolution (DOOM / DOOM II intermission art). */
export const TITLEPIC_WIDTH = 320;
export const TITLEPIC_HEIGHT = 200;

/** Letterbox color around the 320×200 load screen (matches vanilla brown). */
const DOOM_LOAD_BROWN = '#584848';

/** M_LOADG Y offset on the original 200px-tall screen. */
const M_LOADG_VANILLA_Y = 184;

/** Status-bar font: lump STCFN0xx where xx is ASCII code (33–95). */
export function stcfnLumpName(char: string): string | null {
  const code = char.charCodeAt(0);
  if (code < 33 || code > 95) return null;
  return `STCFN0${code}`;
}

function findLump(wad: Wad, name: string): ArrayBuffer | undefined {
  return findWadLump(wad, name);
}

/** Integer scale so the 320×200 TITLEPIC fills the canvas width (classic DOS layout). */
export function titlepicScaleForCanvas(canvasWidth: number, picWidth = TITLEPIC_WIDTH): number {
  return Math.max(1, Math.floor(canvasWidth / picWidth));
}

function drawStcfnText(
  ctx: CanvasRenderingContext2D,
  wad: Wad,
  text: string,
  centerX: number,
  baselineY: number,
  scale = 2
): void {
  const glyphs: Array<{ patch: CanvasRenderingContext2D; width: number }> = [];
  let totalWidth = 0;
  const spacing = 1 * scale;

  for (const char of text) {
    const lump = stcfnLumpName(char);
    if (!lump) continue;
    const data = findLump(wad, lump);
    if (!data) continue;
    const patch = drawPatch(data, wad.playpal);
    const width = patch.canvas.width * scale;
    glyphs.push({ patch, width });
    totalWidth += width + spacing;
  }

  if (totalWidth > 0) totalWidth -= spacing;

  let x = centerX - totalWidth / 2;
  for (const { patch, width } of glyphs) {
    const h = patch.canvas.height * scale;
    ctx.drawImage(patch.canvas, x, baselineY - h, width, h);
    x += width + spacing;
  }
}

/**
 * Draw the classic Doom level load screen: TITLEPIC (retail box logo) top-aligned,
 * M_LOADG plaque, and STCFN "LOADING..." text.
 */
export function drawDoomLoadingScreen(
  canvas: HTMLCanvasElement,
  wad: Wad,
  message = 'LOADING...'
): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = DOOM_LOAD_BROWN;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;

  const titleData = findLump(wad, 'TITLEPIC');
  if (!titleData) {
    drawStcfnText(ctx, wad, message, w / 2, h - 24, 2);
    return false;
  }

  const title = drawPatch(titleData, wad.playpal);
  const picW = title.canvas.width || TITLEPIC_WIDTH;
  const picH = title.canvas.height || TITLEPIC_HEIGHT;
  const scale = titlepicScaleForCanvas(w, picW);
  const drawW = picW * scale;
  const drawH = picH * scale;
  const titleX = Math.floor((w - drawW) / 2);
  const titleY = 0;

  ctx.drawImage(title.canvas, titleX, titleY, drawW, drawH);

  const loadGData = findLump(wad, 'M_LOADG');
  if (loadGData) {
    const loadG = drawPatch(loadGData, wad.playpal);
    const loadGW = loadG.canvas.width * scale;
    const loadGH = loadG.canvas.height * scale;
    const loadGX = Math.floor((w - loadGW) / 2);
    const loadGY = titleY + Math.floor((M_LOADG_VANILLA_Y / TITLEPIC_HEIGHT) * drawH);
    ctx.drawImage(loadG.canvas, loadGX, loadGY, loadGW, loadGH);
  }

  const fontScale = Math.max(2, scale);
  drawStcfnText(ctx, wad, message, w / 2, Math.min(h - 12, titleY + drawH - 6), fontScale);
  return true;
}
