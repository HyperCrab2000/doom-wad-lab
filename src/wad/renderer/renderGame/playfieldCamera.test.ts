import { mat4 } from 'gl-matrix';
import { describe, expect, it } from 'vitest';

import { createPlayfieldCamera, updatePlayfieldCamera } from './playfieldCamera';

describe('playfieldCamera', () => {
  it('uses playfield aspect, not full canvas aspect', () => {
    const viewMatrix = mat4.create();
    mat4.identity(viewMatrix);
    const modelMatrix = mat4.create();
    const camera = createPlayfieldCamera();

    updatePlayfieldCamera(camera, 1280, 900, 45, 0.1, 64000, viewMatrix, modelMatrix);

    expect(camera.layout.width).toBe(1280);
    expect(camera.layout.height).toBe(672);
    expect(camera.layout.width / camera.layout.height).toBeCloseTo(320 / 168, 2);

    const canvasAspectProj = mat4.create();
    mat4.perspective(canvasAspectProj, (45 * Math.PI) / 180, 1280 / 900, 0.1, 64000);
    expect(camera.projectionMatrix[0]).not.toBeCloseTo(canvasAspectProj[0], 3);
  });
});
