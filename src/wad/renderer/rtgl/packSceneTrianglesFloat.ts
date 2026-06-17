import type { SceneTriangle } from './buildSceneTriangles';

/** 5 RGBA32F texels per triangle — world-space xyz in .xyz, metadata in .w */
export const TRI_FLOAT_SLOTS = 5;
const TEX_WIDTH = 256;

export interface PackedFloatTriangles {
  data: Float32Array;
  colorData: Uint8Array;
  width: number;
  height: number;
  colorWidth: number;
  colorHeight: number;
  count: number;
}

export function packSceneTrianglesFloat(
  triangles: SceneTriangle[],
  wallColors: ReadonlyMap<string, [number, number, number]>,
  floorColors: ReadonlyMap<string, [number, number, number]>,
  atlasIndexByName: ReadonlyMap<string, number>
): PackedFloatTriangles {
  const count = triangles.length;
  const texels = Math.max(TRI_FLOAT_SLOTS, count * TRI_FLOAT_SLOTS);
  const height = Math.max(1, Math.ceil(texels / TEX_WIDTH));
  const data = new Float32Array(TEX_WIDTH * height * 4);
  const colorWidth = TEX_WIDTH;
  const colorHeight = Math.max(1, Math.ceil(count / colorWidth));
  const colorData = new Uint8Array(colorWidth * colorHeight * 4);

  for (let i = 0; i < count; i++) {
    const tri = triangles[i];
    const base = i * TRI_FLOAT_SLOTS * 4;
    const atlasIndex = atlasIndexByName.get(tri.texName) ?? 0;
    const palette = tri.surfaceKind === 1 ? floorColors : wallColors;
    const rgb = palette.get(tri.texName) ?? [0.45, 0.45, 0.45];

    data[base + 0] = tri.v0[0];
    data[base + 1] = tri.v0[1];
    data[base + 2] = tri.v0[2];
    data[base + 3] = tri.sectorIndex;
    data[base + 4] = tri.v1[0];
    data[base + 5] = tri.v1[1];
    data[base + 6] = tri.v1[2];
    data[base + 7] = tri.surfaceKind;
    data[base + 8] = tri.v2[0];
    data[base + 9] = tri.v2[1];
    data[base + 10] = tri.v2[2];
    data[base + 11] = atlasIndex;
    data[base + 12] = tri.uv0[0];
    data[base + 13] = tri.uv0[1];
    data[base + 14] = tri.uv1[0];
    data[base + 15] = tri.uv1[1];
    data[base + 16] = tri.uv2[0];
    data[base + 17] = tri.uv2[1];
    data[base + 18] = 0;
    data[base + 19] = 0;

    const colorBase = i * 4;
    colorData[colorBase + 0] = Math.round(Math.min(1, rgb[0]) * 255);
    colorData[colorBase + 1] = Math.round(Math.min(1, rgb[1]) * 255);
    colorData[colorBase + 2] = Math.round(Math.min(1, rgb[2]) * 255);
    colorData[colorBase + 3] = 255;
  }

  return {
    data,
    colorData,
    width: TEX_WIDTH,
    height,
    colorWidth,
    colorHeight,
    count,
  };
}
