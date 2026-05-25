import { describe, expect, it } from 'vitest';
import { mat4 } from 'gl-matrix';

import { extractFrustumPlanes, isSphereInFrustum } from './frustumCull';

describe('frustumCull', () => {
  it('keeps a point in front of the camera inside the frustum', () => {
    const projection = mat4.create();
    const view = mat4.create();
    const mvp = mat4.create();
    mat4.perspective(projection, Math.PI / 4, 1, 0.1, 64000);
    mat4.lookAt(view, [0, 41, 0], [0, 41, -512], [0, 1, 0]);
    mat4.multiply(mvp, projection, view);

    const planes = extractFrustumPlanes(mvp);
    expect(isSphereInFrustum(planes, 0, 41, -256, 32)).toBe(true);
  });

  it('culls a point clearly behind the camera', () => {
    const projection = mat4.create();
    const view = mat4.create();
    const mvp = mat4.create();
    mat4.perspective(projection, Math.PI / 4, 1, 0.1, 64000);
    mat4.lookAt(view, [0, 41, 0], [0, 41, -512], [0, 1, 0]);
    mat4.multiply(mvp, projection, view);

    const planes = extractFrustumPlanes(mvp);
    expect(isSphereInFrustum(planes, 0, 41, 512, 32)).toBe(false);
  });
});
