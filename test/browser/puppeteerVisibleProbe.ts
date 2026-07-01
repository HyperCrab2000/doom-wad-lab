import type { Page } from 'puppeteer';

/** Probes WebGL framebuffer + visible <img> pixels (screenshots of <img> are unreliable in headless Chrome). */
export const VISIBLE_PROBE_SCRIPT = String.raw`
window.__measureVisibleGameCanvas = function(grid) {
  function isBlack(r, g, b) {
    return r <= 8 && g <= 8 && b <= 8;
  }

  function gridBlackRatioFromReadPixels(gl, w, h, grid) {
    let black = 0;
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const x = Math.min(w - 1, Math.floor(((gx + 0.5) / grid) * w));
        const y = Math.min(h - 1, Math.floor(((gy + 0.5) / grid) * h));
        const p = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        if (isBlack(p[0], p[1], p[2])) black++;
      }
    }
    return black / (grid * grid);
  }

  function gridBlackRatioFromVisual(visual, grid) {
    let data;
    let w;
    let h;
    if (visual instanceof HTMLCanvasElement) {
      w = visual.width;
      h = visual.height;
      const ctx = visual.getContext('2d');
      if (!ctx || w < 1 || h < 1) return 1;
      data = ctx.getImageData(0, 0, w, h).data;
    } else {
      const c = document.createElement('canvas');
      c.width = visual.naturalWidth;
      c.height = visual.naturalHeight;
      const ctx = c.getContext('2d');
      if (!ctx || c.width < 1 || c.height < 1 || !visual.complete) return 1;
      ctx.drawImage(visual, 0, 0);
      w = c.width;
      h = c.height;
      data = ctx.getImageData(0, 0, w, h).data;
    }
    let black = 0;
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const x = Math.min(w - 1, Math.floor(((gx + 0.5) / grid) * w));
        const y = Math.min(h - 1, Math.floor(((gy + 0.5) / grid) * h));
        const i = (y * w + x) * 4;
        if (isBlack(data[i], data[i + 1], data[i + 2])) black++;
      }
    }
    return black / (grid * grid);
  }

  const visual = document.querySelector('.game-display') || document.querySelector('.game-canvas');
  const anchor = document.querySelector('.game-canvas');
  const game = visual || anchor;
  const toolbar = document.querySelector('.level-chrome') || document.querySelector('.level-toolbar');
  const toolbarVisible =
    toolbar != null && getComputedStyle(toolbar).display !== 'none' && toolbar.clientHeight > 0;
  const viewer = document.querySelector('.level-viewer');
  const fpsLegacy = document.getElementById('fps-counter')?.textContent ?? null;
  const perfRoot = document.querySelector('[data-testid="perf-meter"]');
  const perfFps = perfRoot?.querySelector('.perf-meter__value:not(.perf-meter__value--ms)')?.textContent?.trim() ?? null;
  const perfMs = perfRoot?.querySelector('.perf-meter__value--ms')?.textContent?.trim() ?? null;
  const fps = perfFps && perfFps !== '–' ? perfFps + ' fps · ' + perfMs + ' ms' : fpsLegacy;

  const meta = {
    hasGameDisplay: Boolean(visual),
    gameSize: anchor ? [anchor.width, anchor.height] : null,
    clientSize: visual
      ? visual instanceof HTMLCanvasElement
        ? [visual.width, visual.height]
        : [visual.naturalWidth, visual.naturalHeight]
      : anchor
        ? [anchor.clientWidth, anchor.clientHeight]
        : null,
    rect: game
      ? {
          w: game.getBoundingClientRect().width,
          h: game.getBoundingClientRect().height,
        }
      : null,
    toolbarVisible,
    mapLoadState: viewer?.getAttribute('data-map-load-state') ?? null,
    isPlaying: viewer?.getAttribute('data-is-playing') === 'true',
    fps,
    fpsLive: (fps != null && fps.includes('(')) || (perfFps != null && perfFps !== '–' && perfMs != null && perfMs !== '–'),
    rendererError: document.querySelector('.renderer-error')?.textContent ?? null,
    hudVisible: false,
    hasWebgl: false,
    glBlackRatio: 1,
    imgBlackRatio: 1,
  };

  const anchorW = anchor?.width ?? 0;
  const anchorH = anchor?.height ?? 0;
  if (!game || anchorW < 8 || anchorH < 8) {
    return { ...meta, blackRatio: 1, samples: 0, visibleSize: null };
  }

  const glSource = anchor?.__doomGlCanvas || anchor;
  const gl = glSource?.getContext('webgl2');
  meta.hasWebgl = Boolean(gl);
  if (gl) {
    gl.flush();
    meta.glBlackRatio = gridBlackRatioFromReadPixels(gl, glSource.width, glSource.height, grid);
  }

  if (visual) {
    const webglVisual =
      visual instanceof HTMLCanvasElement && visual.getContext('webgl2') != null;
    const ready = webglVisual
      ? visual.width > 0 && visual.height > 0
      : visual instanceof HTMLCanvasElement
        ? visual.width > 0 && visual.height > 0
        : visual.complete && visual.naturalWidth > 0;
    if (ready) {
      meta.imgBlackRatio = webglVisual && gl
        ? gridBlackRatioFromReadPixels(gl, visual.width, visual.height, grid)
        : gridBlackRatioFromVisual(visual, grid);
    }
  }

  const gzdoomHud = document.querySelector('.gzdoom-wasm-hud');
  if (gzdoomHud && gzdoomHud.textContent && gzdoomHud.textContent.trim().length > 4) {
    meta.hudVisible = true;
  }

  const hud = document.querySelector('canvas.doom-hud');
  if (hud && hud.width > 0 && hud.height > 0) {
    const hctx = hud.getContext('2d');
    if (hctx) {
      const p = hctx.getImageData(hud.width >> 1, hud.height >> 1, 1, 1).data;
      meta.hudVisible = p[3] > 0 && (p[0] > 8 || p[1] > 8 || p[2] > 8);
    }
  }

  const blackRatio = Math.max(meta.glBlackRatio, meta.imgBlackRatio);

  return {
    ...meta,
    blackRatio,
    samples: grid * grid,
    visibleSize: [anchorW, anchorH],
  };
};
`;

export type VisibleRenderMeasure = {
  hasGameDisplay: boolean;
  blackRatio: number;
  glBlackRatio: number;
  imgBlackRatio: number;
  samples: number;
  gameSize: [number, number] | null;
  clientSize: [number, number] | null;
  rect: { w: number; h: number } | null;
  visibleSize: [number, number] | null;
  toolbarVisible: boolean;
  mapLoadState: string | null;
  isPlaying: boolean;
  fps: string | null;
  fpsLive: boolean;
  rendererError: string | null;
  hudVisible: boolean;
  hasWebgl: boolean;
};

export async function measureVisibleGameCanvas(
  page: Page,
  grid = 10
): Promise<VisibleRenderMeasure> {
  return page.evaluate((gridSize) => {
    return (
      window as unknown as { __measureVisibleGameCanvas: (g: number) => VisibleRenderMeasure }
    ).__measureVisibleGameCanvas(gridSize);
  }, grid);
}
