/** Vanilla status bar width in pixels (STBAR patch). */
export const HUD_BAR_WIDTH = 320;
export const HUD_BAR_HEIGHT = 32;
/** Face patch extends this many pixels above the bar at 1× scale. */
export const HUD_FACE_RISE = 24;
/** Full vanilla screen height used to cap HUD scale on ultrawide viewports. */
export const HUD_SCREEN_HEIGHT = 200;

export interface HudLayout {
  scale: number;
  bandHeight: number;
  barLeft: number;
  barWidth: number;
  barY: number;
  barH: number;
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
  const bandHeight = faceRise + barH;
  const barY = bandHeight - barH;
  return { scale, bandHeight, barLeft, barWidth, barY, barH };
}
