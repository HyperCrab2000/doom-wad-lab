import { describe, expect, it } from 'vitest';

import { packSceneTrianglesFloat } from '@/wad/renderer/rtgl/packSceneTrianglesFloat';
import type { SceneTriangle } from '@/wad/renderer/rtgl/buildSceneTriangles';

function floatBitsToUInt(data: Float32Array): Uint32Array {
  return new Uint32Array(data.buffer, data.byteOffset, data.length);
}

function uintBitsToFloat(data: Uint32Array, index: number): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getFloat32(index * 4, true);
}

describe('pathTrace float bit upload', () => {
  it('preserves world-space triangle coords through uint32 bit reinterpret', () => {
    const tri: SceneTriangle = {
      v0: [1056.25, -39.5, 3616.75],
      v1: [1080, 41, 3620],
      v2: [1040, 0, 3590],
      uv0: [0.1, 0.2],
      uv1: [0.3, 0.4],
      uv2: [0.5, 0.6],
      texName: 'STARTAN2',
      sectorIndex: 3,
      surfaceKind: 0,
    };
    const packed = packSceneTrianglesFloat([tri], new Map(), new Map(), new Map([['STARTAN2', 0]]));
    const bits = floatBitsToUInt(packed.data);

    expect(uintBitsToFloat(bits, 0)).toBeCloseTo(tri.v0[0], 4);
    expect(uintBitsToFloat(bits, 1)).toBeCloseTo(tri.v0[1], 4);
    expect(uintBitsToFloat(bits, 2)).toBeCloseTo(tri.v0[2], 4);
    expect(uintBitsToFloat(bits, 3)).toBeCloseTo(tri.sectorIndex, 4);
  });
});
