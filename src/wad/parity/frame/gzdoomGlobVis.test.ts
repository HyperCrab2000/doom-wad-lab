import { describe, expect, it } from 'vitest';

import { globVisFromPlayfield, rGetGlobVis } from './gzdoomGlobVis';

describe('rGetGlobVis', () => {
  it('matches GZDoom wall glob at 640×480 screenblocks-10 parity layout', () => {
    const wallGlobVis = rGetGlobVis({
      screenWidth: 640,
      screenHeight: 480,
      viewWidth: 640,
      viewHeight: 403,
      centerX: 320,
      rVisibility: 8,
      focalTangent: 1,
    });
    expect(wallGlobVis).toBeGreaterThan(1000);
    expect(wallGlobVis).toBeLessThan(1400);
    expect(Math.round(wallGlobVis)).toBe(1280);
  });

  it('derives separate floor glob from playfield helper', () => {
    const { wallGlobVis, floorGlobVis } = globVisFromPlayfield(640, 480, 640, 403);
    expect(wallGlobVis).toBeGreaterThan(floorGlobVis * 100);
    expect(floorGlobVis).toBeGreaterThan(3);
    expect(floorGlobVis).toBeLessThan(4);
  });
});
