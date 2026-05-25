import { mat4 } from 'gl-matrix';

export interface FrustumPlane {
  nx: number;
  ny: number;
  nz: number;
  d: number;
}

export type FrustumPlanes = FrustumPlane[];

/** Extract six clip planes from a column-major model-view-projection matrix. */
export function extractFrustumPlanes(mvp: mat4): FrustumPlanes {
  const m = mvp;
  const planes: FrustumPlanes = [];

  planes.push(normalizePlane(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]));
  planes.push(normalizePlane(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]));
  planes.push(normalizePlane(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]));
  planes.push(normalizePlane(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]));
  planes.push(normalizePlane(m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]));
  planes.push(normalizePlane(m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]));

  return planes;
}

function normalizePlane(a: number, b: number, c: number, d: number): FrustumPlane {
  const length = Math.hypot(a, b, c) || 1;
  return { nx: a / length, ny: b / length, nz: c / length, d: d / length };
}

export function isSphereInFrustum(
  planes: FrustumPlanes,
  x: number,
  y: number,
  z: number,
  radius: number
): boolean {
  for (const plane of planes) {
    const distance = plane.nx * x + plane.ny * y + plane.nz * z + plane.d;
    if (distance < -radius) {
      return false;
    }
  }
  return true;
}
