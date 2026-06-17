import { mat4 } from 'gl-matrix';

import {
  createPlayfieldCamera,
  updatePlayfieldCamera,
  type PlayfieldCamera,
} from '@/wad/renderer/renderGame/playfieldCamera';

/** @deprecated Use playfieldCamera.invViewProjMatrix from updatePlayfieldCamera(). */
export function buildPathTraceInvViewProj(
  cameraFov: number,
  modelViewMatrix: mat4,
  viewWidth: number,
  viewHeight: number,
  out: mat4 = mat4.create()
): mat4 {
  const camera = createPlayfieldCamera();
  const modelMatrix = mat4.create();
  const viewMatrix = mat4.create();
  mat4.invert(viewMatrix, modelViewMatrix);
  updatePlayfieldCamera(
    camera,
    viewWidth,
    viewHeight,
    cameraFov,
    0.1,
    64000,
    viewMatrix,
    modelMatrix
  );
  mat4.copy(out, camera.invViewProjMatrix);
  return out;
}

export type { PlayfieldCamera };
