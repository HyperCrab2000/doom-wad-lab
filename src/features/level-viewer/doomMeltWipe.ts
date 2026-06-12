/** Classic Doom level transition: vertical columns drip down to reveal the scene below. */

export const MELT_WIPE_DURATION_MS = 1000;

export interface MeltWipeState {
  columnCount: number;
  offset: Float32Array;
  speed: Float32Array;
}

export function meltColumnCount(viewportWidth: number): number {
  return Math.max(1, Math.min(320, Math.round(viewportWidth)));
}

export function createMeltWipeState(viewportWidth: number, viewportHeight: number): MeltWipeState {
  const columnCount = meltColumnCount(viewportWidth);
  const offset = new Float32Array(columnCount);
  const speed = new Float32Array(columnCount);
  const baseSpeed = (viewportHeight / MELT_WIPE_DURATION_MS) * 1000;

  for (let i = 0; i < columnCount; i++) {
    offset[i] = 0;
    speed[i] = baseSpeed * (0.7 + Math.random() * 0.65);
  }

  return { columnCount, offset, speed };
}

export function tickMeltWipeState(state: MeltWipeState, dtMs: number, viewportHeight: number): void {
  const dt = dtMs / 1000;
  for (let i = 0; i < state.columnCount; i++) {
    state.offset[i] += state.speed[i] * dt;
    if (state.offset[i] > viewportHeight) {
      state.offset[i] = viewportHeight;
    }
  }
}

export function isMeltWipeComplete(
  state: MeltWipeState,
  elapsedMs: number,
  viewportHeight: number
): boolean {
  if (elapsedMs < MELT_WIPE_DURATION_MS * 0.55) return false;
  for (let i = 0; i < state.columnCount; i++) {
    if (state.offset[i] < viewportHeight) return false;
  }
  return true;
}

/**
 * Draw melt columns of the loading screen only; cleared pixels reveal the live game canvas below.
 */
export function drawMeltWipeReveal(
  ctx: CanvasRenderingContext2D,
  over: CanvasImageSource,
  state: MeltWipeState,
  width: number,
  height: number
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  const columnWidth = width / state.columnCount;

  for (let col = 0; col < state.columnCount; col++) {
    const meltY = Math.floor(state.offset[col]!);
    if (meltY >= height) continue;

    const sx = Math.floor(col * columnWidth);
    const sw = Math.max(1, Math.ceil((col + 1) * columnWidth) - sx);
    const srcH = height - meltY;

    ctx.drawImage(over, sx, 0, sw, srcH, sx, meltY, sw, srcH);
  }
}

/**
 * Draw the melt: `under` is the revealed scene (new level); `over` drips down in columns.
 */
export function drawMeltWipeFrame(
  ctx: CanvasRenderingContext2D,
  under: CanvasImageSource,
  over: CanvasImageSource,
  state: MeltWipeState,
  width: number,
  height: number
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(under, 0, 0, width, height);

  const columnWidth = width / state.columnCount;

  for (let col = 0; col < state.columnCount; col++) {
    const meltY = Math.floor(state.offset[col]);
    if (meltY >= height) continue;

    const sx = Math.floor(col * columnWidth);
    const sw = Math.max(1, Math.ceil((col + 1) * columnWidth) - sx);
    const srcH = height - meltY;

    ctx.drawImage(over, sx, 0, sw, srcH, sx, meltY, sw, srcH);
  }
}

export function isGameCanvasPresentable(gameCanvas: HTMLCanvasElement): boolean {
  const glSource =
    (gameCanvas as HTMLCanvasElement & { __doomGlCanvas?: HTMLCanvasElement }).__doomGlCanvas ??
    gameCanvas;
  const gl = glSource.getContext('webgl2');
  if (!gl || glSource.width < 1 || glSource.height < 1) {
    return false;
  }

  const pixel = new Uint8Array(4);
  gl.readPixels(
    Math.floor(glSource.width / 2),
    Math.floor(glSource.height / 2),
    1,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixel
  );
  return pixel[0]! !== 0 || pixel[1]! !== 0 || pixel[2]! !== 0;
}

/** Copy WebGL game canvas into a 2D buffer (Y-flipped). Returns false if unreadable. */
export function copyWebGLCanvasTo2D(
  gameCanvas: HTMLCanvasElement,
  target: HTMLCanvasElement,
  width: number,
  height: number
): boolean {
  const ctx = target.getContext('2d');
  if (!ctx) return false;

  target.width = width;
  target.height = height;
  ctx.imageSmoothingEnabled = false;

  const glSource =
    (gameCanvas as HTMLCanvasElement & { __doomGlCanvas?: HTMLCanvasElement }).__doomGlCanvas ??
    gameCanvas;
  const gl = glSource.getContext('webgl2');
  if (!gl || glSource.width < 1 || glSource.height < 1) {
    return false;
  }

  const readW = glSource.width;
  const readH = glSource.height;
  const pixels = new Uint8Array(readW * readH * 4);
  gl.readPixels(0, 0, readW, readH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  const scratch = document.createElement('canvas');
  scratch.width = readW;
  scratch.height = readH;
  const scratchCtx = scratch.getContext('2d');
  if (!scratchCtx) return false;

  const imageData = scratchCtx.createImageData(readW, readH);
  for (let y = 0; y < readH; y++) {
    const srcRow = (readH - 1 - y) * readW * 4;
    const dstRow = y * readW * 4;
    imageData.data.set(pixels.subarray(srcRow, srcRow + readW * 4), dstRow);
  }
  scratchCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(scratch, 0, 0, readW, readH, 0, 0, width, height);
  return true;
}

export function copyGameCanvasTo2D(
  gameCanvas: HTMLCanvasElement,
  target: HTMLCanvasElement,
  width: number,
  height: number
): boolean {
  if (copyWebGLCanvasTo2D(gameCanvas, target, width, height)) {
    return true;
  }

  const ctx = target.getContext('2d');
  if (!ctx || gameCanvas.width < 1 || gameCanvas.height < 1) {
    return false;
  }

  try {
    ctx.imageSmoothingEnabled = false;
    target.width = width;
    target.height = height;
    ctx.drawImage(gameCanvas, 0, 0, width, height);
    return true;
  } catch {
    return false;
  }
}
