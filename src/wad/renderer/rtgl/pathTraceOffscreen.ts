/** Dedicated WebGL2 context for GPU path trace (isolated from classic renderer state). */

let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenGl: WebGL2RenderingContext | null = null;

export function getOffscreenPathTraceGl(): WebGL2RenderingContext {
  if (!offscreenGl) {
    offscreenCanvas = document.createElement('canvas');
    offscreenGl = offscreenCanvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
    }) as WebGL2RenderingContext | null;
    if (!offscreenGl) {
      throw new Error('Failed to create offscreen WebGL2 context for path trace');
    }
  }
  return offscreenGl;
}

export function getOffscreenPathTraceCanvas(): HTMLCanvasElement {
  getOffscreenPathTraceGl();
  return offscreenCanvas!;
}

export function resetOffscreenPathTraceGl(): void {
  offscreenCanvas = null;
  offscreenGl = null;
}
