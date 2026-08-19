import { drawPatchImage } from '@/wad/renderer/drawAssets/drawPatch';
import type { Wad } from '@/wad/interfaces/Wad';
import { findWadLump } from './doomWadGraphics';
import { drawMenuStcfnLabel, titlepicScaleForCanvas } from './doomLoadingScreen';

/** Vanilla 320×200 menu coordinate space (GZDoom MainMenu / pause layout). */
export const DOOM_MENU_WIDTH = 320;
export const DOOM_MENU_HEIGHT = 200;

const DOOM_MENU_BROWN = '#584848';
const SKULL_OFFSET_X = -32;
const SKULL_OFFSET_Y = -5;

export type DoomPatchMenuScreen = 'pause' | 'main' | 'options';

export interface DoomPatchMenuItem {
  id: string;
  /** IWAD patch lump (M_OPTION, M_NGAME, …). */
  patch?: string;
  /** STCFN label (supports multi-word strings split on spaces). */
  stcfn?: string;
}

export interface DoomPatchMenuLayout {
  titlePatch?: string;
  titleX: number;
  titleY: number;
  itemX: number;
  itemY: number;
  lineSpacing: number;
  items: DoomPatchMenuItem[];
}

interface DrawnPatch {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  leftOffset: number;
  topOffset: number;
}

function loadMenuPatch(wad: Wad, name: string, scale: number): DrawnPatch | null {
  const data = findWadLump(wad, name);
  if (!data) return null;
  const patch = drawPatchImage(data, wad.playpal);
  const width = patch.width * scale;
  const height = patch.height * scale;
  if (!width || !height) return null;
  return {
    canvas: patch.canvas,
    width,
    height,
    leftOffset: patch.leftOffset * scale,
    topOffset: patch.topOffset * scale,
  };
}

function drawMenuPatch(
  ctx: CanvasRenderingContext2D,
  patch: DrawnPatch,
  x: number,
  y: number
): number {
  const drawX = x + patch.leftOffset;
  const drawY = y + patch.topOffset;
  ctx.drawImage(patch.canvas, drawX, drawY, patch.width, patch.height);
  return patch.topOffset + patch.height;
}

function drawMenuItemLabel(
  ctx: CanvasRenderingContext2D,
  wad: Wad,
  item: DoomPatchMenuItem,
  x: number,
  y: number,
  scale: number
): number {
  if (item.patch) {
    const patch = loadMenuPatch(wad, item.patch, scale);
    if (patch) {
      return drawMenuPatch(ctx, patch, x, y);
    }
  }
  if (item.stcfn) {
    return drawMenuStcfnLabel(ctx, wad, item.stcfn, x, y, scale);
  }
  return scale * 8;
}

/** GZDoom Doom MainMenu positions from menudef.txt (Position 97,72 · LineSpacing 16). */
export function layoutForScreen(
  screen: DoomPatchMenuScreen,
  opts: { sfxMuted: boolean; musicEnabled: boolean }
): DoomPatchMenuLayout {
  if (screen === 'main') {
    return {
      titlePatch: 'M_DOOM',
      titleX: 94,
      titleY: 2,
      itemX: 97,
      itemY: 72,
      lineSpacing: 16,
      items: [
        { id: 'newgame', patch: 'M_NGAME' },
        { id: 'options', patch: 'M_OPTION' },
        { id: 'load', patch: 'M_LOADG' },
        { id: 'save', patch: 'M_SAVEG' },
        { id: 'quit', patch: 'M_QUITG' },
      ],
    };
  }

  if (screen === 'options') {
    return {
      titlePatch: 'M_OPTTTL',
      titleX: 120,
      titleY: 8,
      itemX: 97,
      itemY: 72,
      lineSpacing: 18,
      items: [
        { id: 'sfx', stcfn: `SOUND FX ${opts.sfxMuted ? 'OFF' : 'ON'}` },
        { id: 'music', stcfn: `MUSIC ${opts.musicEnabled ? 'ON' : 'OFF'}` },
        { id: 'back', stcfn: 'BACK' },
      ],
    };
  }

  // GZDoom / vanilla pause: M_PAUSE graphic only (no item list — that is the main menu on Esc).
  return {
    titlePatch: 'M_PAUSE',
    titleX: 160,
    titleY: 100,
    itemX: 97,
    itemY: 72,
    lineSpacing: 16,
    items: [],
  };
}

export interface DrawDoomPatchMenuOptions {
  screen: DoomPatchMenuScreen;
  selectedIndex: number;
  skullFrame: 0 | 1;
  wad: Wad;
  gameCanvas?: HTMLCanvasElement | null;
  sfxMuted?: boolean;
  musicEnabled?: boolean;
}

/**
 * Draw a GZDoom-style patch menu on a full-viewport canvas: dimmed game view
 * (when available) plus vanilla 320×200 menu coordinates scaled to fit.
 */
export function drawDoomPatchMenu(
  canvas: HTMLCanvasElement,
  options: DrawDoomPatchMenuOptions
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.imageSmoothingEnabled = false;

  if (options.gameCanvas && options.gameCanvas.width > 0 && options.gameCanvas.height > 0) {
    ctx.drawImage(options.gameCanvas, 0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = DOOM_MENU_BROWN;
    ctx.fillRect(0, 0, w, h);
  }

  const scale = titlepicScaleForCanvas(w, DOOM_MENU_WIDTH);
  const menuW = DOOM_MENU_WIDTH * scale;
  const menuH = DOOM_MENU_HEIGHT * scale;
  const originX = Math.floor((w - menuW) / 2);
  const originY = Math.floor((h - menuH) / 2);

  const layout = layoutForScreen(options.screen, {
    sfxMuted: options.sfxMuted ?? false,
    musicEnabled: options.musicEnabled ?? true,
  });

  // Pause overlay: centered M_PAUSE on dimmed game (GZDoom / vanilla), no menu chrome.
  if (options.screen === 'pause' && layout.items.length === 0 && layout.titlePatch) {
    const title = loadMenuPatch(options.wad, layout.titlePatch, scale);
    if (title) {
      const tx = Math.floor((w - title.width) / 2 - title.leftOffset);
      const ty = Math.floor((h - title.height) / 2 - title.topOffset);
      drawMenuPatch(ctx, title, tx, ty);
    }
    return;
  }

  if (layout.titlePatch) {
    const title = loadMenuPatch(options.wad, layout.titlePatch, scale);
    if (title) {
      const tx = originX + layout.titleX * scale;
      const ty = originY + layout.titleY * scale;
      if (layout.titlePatch === 'M_PAUSE' || layout.titlePatch === 'M_OPTTTL') {
        drawMenuPatch(ctx, title, tx - title.width / 2 - title.leftOffset, ty);
      } else {
        drawMenuPatch(ctx, title, tx, ty);
      }
    }
  }

  const skullName = options.skullFrame === 0 ? 'M_SKULL1' : 'M_SKULL2';
  const skull = loadMenuPatch(options.wad, skullName, scale);

  let itemY = originY + layout.itemY * scale;
  const itemX = originX + layout.itemX * scale;
  const rowGap = 2 * scale;

  for (let i = 0; i < layout.items.length; i++) {
    const item = layout.items[i]!;
    const rowHeight = drawMenuItemLabel(ctx, options.wad, item, itemX, itemY, scale);

    if (i === options.selectedIndex && skull) {
      const skullX = itemX + SKULL_OFFSET_X * scale;
      const skullY = itemY + SKULL_OFFSET_Y * scale;
      drawMenuPatch(ctx, skull, skullX, skullY);
    }

    itemY += Math.max(layout.lineSpacing * scale, rowHeight + rowGap);
  }
}

export function menuItemCount(screen: DoomPatchMenuScreen): number {
  return layoutForScreen(screen, { sfxMuted: false, musicEnabled: true }).items.length;
}

export function menuItemId(screen: DoomPatchMenuScreen, index: number): string | null {
  const items = layoutForScreen(screen, { sfxMuted: false, musicEnabled: true }).items;
  return items[index]?.id ?? null;
}
