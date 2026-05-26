import { vec3 } from 'gl-matrix';
import { describe, expect, it } from 'vitest';

import { triangle3DFromPoints } from '@/wad/utils/triangle3DFromPoints';

describe('triangle3DFromPoints', () => {
  it('builds edges, a normal, and an axis-aligned bounds box', () => {
    const v1 = vec3.fromValues(0, 0, 0);
    const v2 = vec3.fromValues(4, 0, 0);
    const v3 = vec3.fromValues(0, 3, 2);

    const triangle = triangle3DFromPoints(v1, v2, v3);

    expect(triangle.v1).toBe(v1);
    expect(triangle.edge1[0]).toBeCloseTo(4);
    expect(triangle.edge2[1]).toBeCloseTo(3);
    expect(triangle.normal[2]).not.toBe(0);
    expect(triangle.aabb.min[0]).toBe(0);
    expect(triangle.aabb.max[0]).toBe(4);
    expect(triangle.aabb.max[1]).toBe(3);
    expect(triangle.aabb.max[2]).toBe(2);
  });
});
