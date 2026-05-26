import { describe, expect, it } from 'vitest';
import { mat4 } from 'gl-matrix';

import { extractFrustumPlanes, isSphereInFrustum } from './frustumCull';

function createCameraFrustum() {
  const projection = mat4.create();
  const view = mat4.create();
  const mvp = mat4.create();
  mat4.perspective(projection, Math.PI / 4, 1, 0.1, 64000);
  mat4.lookAt(view, [0, 41, 0], [0, 41, -512], [0, 1, 0]);
  mat4.multiply(mvp, projection, view);
  return extractFrustumPlanes(mvp);
}

describe('frustumCull', () => {
  it('keeps a point in front of the camera inside the frustum', () => {
    const planes = createCameraFrustum();
    expect(isSphereInFrustum(planes, 0, 41, -256, 32)).toBe(true);
  });

  it('culls a point clearly behind the camera', () => {
    const planes = createCameraFrustum();
    expect(isSphereInFrustum(planes, 0, 41, 512, 32)).toBe(false);
  });

  it('extracts six normalized frustum planes', () => {
    const planes = createCameraFrustum();
    expect(planes).toHaveLength(6);
    for (const plane of planes) {
      expect(Math.hypot(plane.nx, plane.ny, plane.nz)).toBeCloseTo(1, 5);
    }
  });

  it('culls objects far outside the horizontal field of view', () => {
    const planes = createCameraFrustum();
    expect(isSphereInFrustum(planes, 4096, 41, -256, 32)).toBe(false);
  });

  it('keeps a large bounding sphere that spans a culled center point', () => {
    const planes = createCameraFrustum();
    expect(isSphereInFrustum(planes, 4096, 41, -256, 32)).toBe(false);
    expect(isSphereInFrustum(planes, 4096, 41, -256, 5000)).toBe(true);
  });

  it('treats a zero-length plane normal as safe to normalize', () => {
    const identity = mat4.create();
    const planes = extractFrustumPlanes(identity);
    expect(planes).toHaveLength(6);
    expect(isSphereInFrustum(planes, 0, 0, 0, 1)).toBe(true);
  });
});
