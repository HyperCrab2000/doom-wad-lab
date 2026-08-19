import { describe, expect, it } from 'vitest';

import {
  gzdoomColormapIndex,
  gzdoomShadeNormalized,
  MAX_VIS_NORMALIZED,
  wallVisibility,
} from './gzdoomColormap';

describe('gzdoomColormapIndex', () => {
  it('caps visibility at 24/32 like GZDoom GLES R_ZDoomColormap', () => {
    expect(MAX_VIS_NORMALIZED).toBeCloseTo(0.75, 5);
    const globOverZ = wallVisibility(500, 1280);
    expect(globOverZ).toBeCloseTo(1280 / 32 / 500, 2);
    const band = gzdoomColormapIndex(192, globOverZ);
    const shade = gzdoomShadeNormalized(192);
    const expected = Math.floor((shade - Math.min(globOverZ, MAX_VIS_NORMALIZED)) * 32);
    expect(band).toBe(Math.max(0, Math.min(31, expected)));
  });

  it('matches GZDoom formula at moderate distance', () => {
    const light = 128;
    const z = 800;
    const glob = 1280;
    const globOverZ = glob / z;
    const shade = 2.0 - (light + 12) / 128;
    const vis = Math.min(globOverZ, 24 / 32);
    const expected = Math.max(0, Math.min(31, Math.floor((shade - vis) * 32)));
    expect(gzdoomColormapIndex(light, globOverZ)).toBe(expected);
  });

  it('documents GLES flat parity: wall glob / screen Z (see flat.frag)', () => {
    const glob = 1280;
    expect(wallVisibility(200, glob)).toBeGreaterThan(wallVisibility(1200, glob));
  });
});
