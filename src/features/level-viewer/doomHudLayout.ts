import {
  VANILLA_SCREEN_HEIGHT,
  VANILLA_STATUS_BAR_HEIGHT,
} from '@/wad/renderer/renderGame/gameViewLayout';

/** Vanilla status bar width in pixels (STBAR patch). */
export const HUD_BAR_WIDTH = 320;
export const HUD_BAR_HEIGHT = 32;
/** Face patch extends this many pixels above the bar at 1× scale. */
export const HUD_FACE_RISE = 24;
/** Full vanilla screen height used to cap HUD scale on ultrawide viewports. */
export const HUD_SCREEN_HEIGHT = VANILLA_SCREEN_HEIGHT;

export interface HudLayout {
  scale: number;
  /** Bottom-anchored wrap height (matches WebGL status band). */
  bandHeight: number;
  /** Canvas bitmap height (includes face rise above STBAR). */
  canvasHeight: number;
  barLeft: number;
  barWidth: number;
  barY: number;
  barH: number;
  faceRise: number;
  statusBandPx: number;
}

export function computeHudLayout(viewportWidth: number, viewportHeight: number): HudLayout {
  const scale = Math.max(
    1,
    Math.min(
      Math.floor(viewportWidth / HUD_BAR_WIDTH),
      Math.floor(Math.max(HUD_SCREEN_HEIGHT, viewportHeight) / HUD_SCREEN_HEIGHT)
    )
  );
  const barWidth = HUD_BAR_WIDTH * scale;
  const barH = HUD_BAR_HEIGHT * scale;
  const barLeft = Math.round((viewportWidth - barWidth) / 2);
  const faceRise = HUD_FACE_RISE * scale;
  // Match WebGL clearGzdoomStatusBarBand reservation (32/200 of canvas height).
  const statusBandPx = Math.round(
    (viewportHeight * VANILLA_STATUS_BAR_HEIGHT) / VANILLA_SCREEN_HEIGHT,
  );
  const bandHeight = Math.max(statusBandPx, barH);
  const canvasHeight = bandHeight + faceRise;
  const barY = canvasHeight - barH;
  return { scale, bandHeight, canvasHeight, barLeft, barWidth, barY, barH, faceRise, statusBandPx };
}
