import { mat4 } from 'gl-matrix';

import { computeGameViewLayout, type GameViewLayout } from './gameViewLayout';

/** Shared camera matrices for classic + path trace (same view, playfield projection). */
export interface PlayfieldCamera {
  layout: GameViewLayout;
  projectionMatrix: mat4;
  modelViewMatrix: mat4;
  modelViewProjMatrix: mat4;
  invViewProjMatrix: mat4;
}

export function createPlayfieldCamera(): PlayfieldCamera {
  return {
    layout: computeGameViewLayout(1, 1),
    projectionMatrix: mat4.create(),
    modelViewMatrix: mat4.create(),
    modelViewProjMatrix: mat4.create(),
    invViewProjMatrix: mat4.create(),
  };
}

export function updatePlayfieldCamera(
  camera: PlayfieldCamera,
  canvasWidth: number,
  canvasHeight: number,
  cameraFov: number,
  cameraNear: number,
  cameraFar: number,
  viewMatrix: mat4,
  modelMatrix: mat4,
  layoutOverride?: GameViewLayout,
): void {
  camera.layout = layoutOverride ?? computeGameViewLayout(canvasWidth, canvasHeight);
  mat4.perspective(
    camera.projectionMatrix,
    (cameraFov / 180) * Math.PI,
    camera.layout.width / camera.layout.height,
    cameraNear,
    cameraFar
  );
  mat4.multiply(camera.modelViewMatrix, viewMatrix, modelMatrix);
  mat4.multiply(camera.modelViewProjMatrix, camera.projectionMatrix, camera.modelViewMatrix);
  mat4.invert(camera.invViewProjMatrix, camera.modelViewProjMatrix);
}

/** Apply letterboxed playfield viewport; caller clears/draws inside it. */
export function bindPlayfieldViewport(gl: WebGL2RenderingContext, layout: GameViewLayout): void {
  gl.viewport(layout.offsetX, layout.glY, layout.width, layout.height);
}

export function clearPlayfieldChrome(gl: WebGL2RenderingContext, chromaKey = true): void {
  const w = gl.canvas.width;
  const h = gl.canvas.height;
  gl.viewport(0, 0, w, h);
  if (chromaKey) {
    gl.clearColor(1.0, 0.0, 1.0, 1.0);
  } else {
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
  }
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

/** Black letterbox bars for path trace (no chromakey compositing). */
export function clearPathTraceLetterbox(gl: WebGL2RenderingContext): void {
  const w = gl.canvas.width;
  const h = gl.canvas.height;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}
