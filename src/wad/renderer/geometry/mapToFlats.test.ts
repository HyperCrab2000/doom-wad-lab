import { describe, expect, it } from 'vitest';
import { mat4 } from 'gl-matrix';

import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import { mapToFlats } from '@/wad/renderer/geometry/mapToFlats';
import { extractFrustumPlanes, isSphereInFrustum } from '@/wad/renderer/utils/frustumCull';
import { FRUSTUM_CULL_RADIUS } from '@/wad/constants/RenderInfo';

describe('mapToFlats', () => {
  it('computes boundsRadius large enough to cover every flat vertex', () => {
    const sector = {
      floorheight: 0,
      ceilingheight: 128,
      floorpic: 'FLOOR4_8',
      ceilingpic: 'CEIL1_1',
    } as Sector;

    const map = {
      SECTORS: [sector],
    } as WadMap;

    const triangles = [
      [
        { x: 0, y: 0 },
        { x: 2048, y: 0 },
        { x: 2048, y: 2048 },
      ],
      [
        { x: 0, y: 0 },
        { x: 2048, y: 2048 },
        { x: 0, y: 2048 },
      ],
    ];

    const [floor] = mapToFlats(map, { 0: triangles });

    expect(floor.boundsRadius).toBeGreaterThan(1000);
    expect(floor.boundsRadius).toBeLessThan(2048);

    for (let i = 0; i < floor.position.length; i += 3) {
      const dx = floor.position[i] - floor.center[0];
      const dy = floor.position[i + 1] - floor.center[1];
      const dz = floor.position[i + 2] - floor.center[2];
      expect(Math.hypot(dx, dy, dz)).toBeLessThanOrEqual(floor.boundsRadius + 0.001);
    }
  });

  it('keeps large camera-sector floors inside the view frustum', () => {
    const sector = {
      floorheight: 0,
      ceilingheight: 128,
      floorpic: 'FLOOR4_8',
      ceilingpic: 'CEIL1_1',
    } as Sector;

    const map = {
      SECTORS: [sector],
    } as WadMap;

    const triangles = [
      [
        { x: 0, y: 0 },
        { x: 4096, y: 0 },
        { x: 4096, y: 4096 },
      ],
      [
        { x: 0, y: 0 },
        { x: 4096, y: 4096 },
        { x: 0, y: 4096 },
      ],
    ];

    const [floor] = mapToFlats(map, { 0: triangles });

    const projection = mat4.create();
    const view = mat4.create();
    const mvp = mat4.create();
    mat4.perspective(projection, Math.PI / 4, 16 / 9, 0.1, 64000);
    mat4.lookAt(view, [256, 41, -256], [256, 41, -768], [0, 1, 0]);
    mat4.multiply(mvp, projection, view);

    const planes = extractFrustumPlanes(mvp);
    const fixedRadiusVisible = isSphereInFrustum(
      planes,
      floor.center[0],
      floor.center[1],
      floor.center[2],
      FRUSTUM_CULL_RADIUS
    );
    const boundsRadiusVisible = isSphereInFrustum(
      planes,
      floor.center[0],
      floor.center[1],
      floor.center[2],
      Math.max(FRUSTUM_CULL_RADIUS, floor.boundsRadius)
    );

    expect(fixedRadiusVisible).toBe(false);
    expect(boundsRadiusVisible).toBe(true);
  });
});
