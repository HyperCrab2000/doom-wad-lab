export type CanvasPixelSample = {
  mapLoadState: string | null;
  isPlaying: boolean;
  selectedMap: string | null;
  wadPath: string | null;
  hudVisible: boolean;
  fps: string | null;
  fpsLive: boolean;
  rendererError: string | null;
  gameSize: [number, number] | null;
  clientSize: [number, number] | null;
  displayPixels: number[][];
  centerNonBlack: boolean;
};

export type BlacknessMeasure = {
  blackRatio: number;
  samples: number;
  gameSize: [number, number] | null;
  toolbarVisible: boolean;
};

export function isBlackRgb(pixel: number[] | undefined): boolean {
  if (!pixel) return true;
  return pixel[0]! <= 8 && pixel[1]! <= 8 && pixel[2]! <= 8;
}

/** Grid-sample the WebGL game canvas via readPixels. */
export function measureRendererBlackRatio(grid = 10): BlacknessMeasure {
  const game = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
  const toolbar = document.querySelector('.level-toolbar') as HTMLElement | null;
  const toolbarVisible =
    toolbar != null && getComputedStyle(toolbar).display !== 'none' && toolbar.clientHeight > 0;

  if (!game || game.width < 8 || game.height < 8) {
    return { blackRatio: 1, samples: 0, gameSize: null, toolbarVisible };
  }

  const gl = game.getContext('webgl2');
  if (!gl) {
    return { blackRatio: 1, samples: 0, gameSize: [game.width, game.height], toolbarVisible };
  }

  gl.flush();
  let black = 0;
  let total = 0;
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x = Math.min(game.width - 1, Math.floor(((gx + 0.5) / grid) * game.width));
      const y = Math.min(game.height - 1, Math.floor(((gy + 0.5) / grid) * game.height));
      const px = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (isBlackRgb(Array.from(px))) black += 1;
      total += 1;
    }
  }

  return {
    blackRatio: total > 0 ? black / total : 1,
    samples: total,
    gameSize: [game.width, game.height],
    toolbarVisible,
  };
}

export function sampleGameCanvasDisplay(): CanvasPixelSample {
  const game = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
  const viewer = document.querySelector('.level-viewer');
  const wadSelect = document.querySelector('.level-toolbar select') as HTMLSelectElement | null;
  const mapSelect = document.querySelectorAll('.level-toolbar select')[1] as
    | HTMLSelectElement
    | undefined;

  const displayPixels: number[][] = [];
  if (game && game.width > 1 && game.height > 1) {
    const gl = game.getContext('webgl2');
    if (gl) {
      gl.flush();
      const points: [number, number][] = [
        [game.width >> 1, game.height >> 1],
        [game.width >> 2, game.height >> 2],
        [(game.width * 3) >> 2, game.height >> 2],
        [game.width >> 1, game.height >> 3],
      ];
      for (const [x, y] of points) {
        const px = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        displayPixels.push(Array.from(px));
      }
    }
  }

  const hudCanvas = document.querySelector('canvas.doom-hud') as HTMLCanvasElement | null;
  let hudVisible = false;
  if (hudCanvas && hudCanvas.width > 0 && hudCanvas.height > 0) {
    const hudCtx = hudCanvas.getContext('2d');
    if (hudCtx) {
      const px = hudCtx.getImageData(
        Math.floor(hudCanvas.width / 2),
        Math.floor(hudCanvas.height / 2),
        1,
        1
      ).data;
      hudVisible = px[3]! > 0 && (px[0]! > 8 || px[1]! > 8 || px[2]! > 8);
    }
  }

  const center = displayPixels[0];
  const centerNonBlack =
    center != null && (center[0]! > 8 || center[1]! > 8 || center[2]! > 8);
  const fps = document.getElementById('fps-counter')?.textContent ?? null;

  return {
    mapLoadState: viewer?.getAttribute('data-map-load-state') ?? null,
    isPlaying: viewer?.getAttribute('data-is-playing') === 'true',
    selectedMap: mapSelect?.value ?? null,
    wadPath: wadSelect?.value ?? null,
    hudVisible,
    fps,
    fpsLive: fps != null && fps.includes('('),
    rendererError: document.querySelector('.renderer-error')?.textContent ?? null,
    gameSize: game ? [game.width, game.height] : null,
    clientSize: game ? [game.clientWidth, game.clientHeight] : null,
    displayPixels,
    centerNonBlack,
  };
}

export function isRendererMostlyBlack(maxBlackRatio = 0.45): boolean {
  return measureRendererBlackRatio().blackRatio > maxBlackRatio;
}
