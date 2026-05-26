import { vec3 } from 'gl-matrix';
import { describe, expect, it } from 'vitest';

import { Ray } from '@/wad/interfaces/Ray';
import { triangle3DFromPoints } from '@/wad/utils/triangle3DFromPoints';
import { rayTriangleIntersection } from '@/wad/utils/rayTriangleIntersection';

describe('rayTriangleIntersection', () => {
  it('returns the hit point for a ray through a triangle', () => {
    const triangle = triangle3DFromPoints(
      vec3.fromValues(0, 0, 0),
      vec3.fromValues(4, 0, 0),
      vec3.fromValues(0, 4, 0)
    );
    const ray: Ray = {
      position: vec3.fromValues(1, 1, -2),
      direction: vec3.fromValues(0, 0, 1),
    };
    const out = vec3.create();

    const hit = rayTriangleIntersection(out, ray, triangle);
    expect(hit).toBe(out);
    expect(out[2]).toBeCloseTo(0, 5);
  });

  it('returns undefined for parallel rays and misses outside the triangle', () => {
    const triangle = triangle3DFromPoints(
      vec3.fromValues(0, 0, 0),
      vec3.fromValues(4, 0, 0),
      vec3.fromValues(0, 4, 0)
    );
    const parallel: Ray = {
      position: vec3.fromValues(0, 0, 0),
      direction: vec3.fromValues(1, 0, 0),
    };
    const miss: Ray = {
      position: vec3.fromValues(10, 10, -1),
      direction: vec3.fromValues(0, 0, 1),
    };
    const out = vec3.create();

    expect(rayTriangleIntersection(out, parallel, triangle)).toBeUndefined();
    expect(rayTriangleIntersection(out, miss, triangle)).toBeUndefined();
  });

  it('ignores intersections behind the ray origin', () => {
    const triangle = triangle3DFromPoints(
      vec3.fromValues(0, 0, 0),
      vec3.fromValues(4, 0, 0),
      vec3.fromValues(0, 4, 0)
    );
    const ray: Ray = {
      position: vec3.fromValues(1, 1, 2),
      direction: vec3.fromValues(0, 0, 1),
    };
    const out = vec3.create();

    expect(rayTriangleIntersection(out, ray, triangle)).toBeUndefined();
  });
});
