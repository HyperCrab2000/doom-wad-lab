/** Vanilla Doom playfield: 320×168 3D view + 32px status bar = 320×200. */
export const VANILLA_SCREEN_WIDTH = 320;
export const VANILLA_3D_HEIGHT = 168;
export const VANILLA_STATUS_BAR_HEIGHT = 32;
export const VANILLA_SCREEN_HEIGHT = VANILLA_3D_HEIGHT + VANILLA_STATUS_BAR_HEIGHT;

export interface GameViewLayout {
  scale: number;
  /** Letterboxed 3D view origin (CSS top-left). */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  /** WebGL viewport origin Y (bottom-left). */
  glY: number;
}

export function computeGameViewLayout(canvasWidth: number, canvasHeight: number): GameViewLayout {
  const scale = Math.max(1, Math.floor(canvasWidth / VANILLA_SCREEN_WIDTH));
  const width = VANILLA_SCREEN_WIDTH * scale;
  const height = VANILLA_3D_HEIGHT * scale;
  const offsetX = Math.round((canvasWidth - width) / 2);
  const frameHeight = VANILLA_SCREEN_HEIGHT * scale;
  const offsetY = Math.max(0, Math.round((canvasHeight - frameHeight) / 2));
  const glY = canvasHeight - offsetY - height;
  return { scale, offsetX, offsetY, width, height, glY };
}
