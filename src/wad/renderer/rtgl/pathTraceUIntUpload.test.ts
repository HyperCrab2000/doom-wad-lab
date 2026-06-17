import { describe, expect, it } from 'vitest';

import { decodePackedVertex, packSceneTriangles } from '@/wad/renderer/rtgl/packSceneTriangles';
import type { SceneTriangle } from '@/wad/renderer/rtgl/buildSceneTriangles';

function triangleBytesToUInt(dataBytes: Uint8Array): Uint32Array {
  const texelCount = dataBytes.length / 4;
  const out = new Uint32Array(texelCount * 4);
  for (let t = 0; t < texelCount; t++) {
    const b = t * 4;
    const o = t * 4;
    out[o] = dataBytes[b];
    out[o + 1] = dataBytes[b + 1];
    out[o + 2] = dataBytes[b + 2];
    out[o + 3] = dataBytes[b + 3];
  }
  return out;
}

function decodeFromUInt(
  dataUInt: Uint32Array,
  triIndex: number,
  vertexSlot: 0 | 1 | 2,
  bounds: ReturnType<typeof packSceneTriangles>['bounds']
): [number, number, number] {
  const triBase = triIndex * 8;
  const xySlot = triBase + vertexSlot * 2;
  const zSlot = triBase + vertexSlot * 2 + 1;
  const x16 = dataUInt[xySlot * 4] + dataUInt[xySlot * 4 + 1] * 256;
  const y16 = dataUInt[xySlot * 4 + 2] + dataUInt[xySlot * 4 + 3] * 256;
  const z16 = dataUInt[zSlot * 4] + dataUInt[zSlot * 4 + 1] * 256;
  return [
    bounds.origin[0] + (x16 / 65535) * bounds.scale[0],
    bounds.origin[1] + (y16 / 65535) * bounds.scale[1],
    bounds.origin[2] + (z16 / 65535) * bounds.scale[2],
  ];
}

describe('pathTrace triangle RGBA32UI upload', () => {
  it('uint texels decode identically to RGBA8 bytes', () => {
    const tri: SceneTriangle = {
      v0: [100, 41, -200],
      v1: [120, 50, -180],
      v2: [110, 45, -190],
      uv0: [0.1, 0.2],
      uv1: [0.3, 0.4],
      uv2: [0.5, 0.6],
      texName: 'STARTAN2',
      sectorIndex: 3,
      surfaceKind: 0,
    };
    const packed = packSceneTriangles([tri], new Map(), new Map(), new Map([['STARTAN2', 0]]));
    const dataUInt = triangleBytesToUInt(packed.dataBytes);
    for (let v = 0; v < 3; v++) {
      const fromBytes = decodePackedVertex(packed.dataBytes, 0, v as 0 | 1 | 2, packed.bounds);
      const fromUInt = decodeFromUInt(dataUInt, 0, v as 0 | 1 | 2, packed.bounds);
      expect(fromUInt[0]).toBeCloseTo(fromBytes[0], 3);
      expect(fromUInt[1]).toBeCloseTo(fromBytes[1], 3);
      expect(fromUInt[2]).toBeCloseTo(fromBytes[2], 3);
    }
  });
});
