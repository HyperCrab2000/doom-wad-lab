import { describe, expect, it } from 'vitest';

import type { SceneTriangle } from './buildSceneTriangles';
import { decodePackedVertex, packSceneTriangles, TRI_SLOTS } from './packSceneTriangles';
import { atlasLookupKey } from './textureAtlas';

function texelBytes(triIndex: number, slot: number): number {
  return (triIndex * TRI_SLOTS + slot) * 4;
}

describe('packSceneTriangles', () => {
  it('packs 16-bit positions with sub-unit precision over large bounds', () => {
    const tri: SceneTriangle = {
      v0: [100, 41, -200],
      v1: [108, 41, -200],
      v2: [108, 49, -200],
      uv0: [0, 0],
      uv1: [1, 0],
      uv2: [1, 1],
      sectorIndex: 7,
      texName: 'STARTAN3',
      surfaceKind: 0,
    };
    const farTri: SceneTriangle = {
      ...tri,
      v0: [2100, 41, -1800],
      v1: [2108, 41, -1800],
      v2: [2108, 49, -1800],
    };
    const packed = packSceneTriangles(
      [tri, farTri],
      new Map(),
      new Map(),
      new Map([[atlasLookupKey('STARTAN3', 0), 3]])
    );

    expect(packed.dataBytes[texelBytes(0, 1) + 2]).toBe(7);
    expect(packed.dataBytes[texelBytes(0, 5) + 2]).toBe(3);
    expect(packed.dataBytes[texelBytes(0, 5) + 3]).toBe(0);

    const decoded = decodePackedVertex(packed.dataBytes, 0, 0, packed.bounds);
    expect(decoded[0]).toBeCloseTo(100, 0);
    expect(decoded[1]).toBeCloseTo(41, 0);
    expect(decoded[2]).toBeCloseTo(-200, 0);

    const v1 = decodePackedVertex(packed.dataBytes, 0, 1, packed.bounds);
    expect(v1[0]).toBeCloseTo(108, 0);
    expect(Math.abs(v1[0] - 108)).toBeLessThan(0.5);

    const farV0 = decodePackedVertex(packed.dataBytes, 1, 0, packed.bounds);
    expect(Math.abs(farV0[0] - 2100)).toBeLessThan(0.5);
  });
});
