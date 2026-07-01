import type { mat4 } from 'gl-matrix';

import type { SceneTriangle } from './buildSceneTriangles';
import type { CpuTextureAtlas } from './textureAtlas';

export type SerializedColorMap = Array<[string, number, number, number]>;

export interface SerializedCpuAtlas {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  cols: number;
  rows: number;
  cellSize: number;
  indexByName: Array<[string, number]>;
}

export interface PathTraceWorkerRequest {
  id: number;
  type: 'trace';
  triangles: SceneTriangle[];
  invViewProj: Float32Array;
  width: number;
  height: number;
  sectorLight: Float32Array;
  wallColors: SerializedColorMap;
  floorColors: SerializedColorMap;
  atlas: SerializedCpuAtlas | null;
}

export interface PathTraceWorkerResponse {
  id: number;
  type: 'traced';
  pixels?: Uint8Array;
  width?: number;
  height?: number;
  traceMs?: number;
  error?: string;
}

export function serializeColorMap(map: ReadonlyMap<string, [number, number, number]>): SerializedColorMap {
  return [...map.entries()];
}

export function deserializeColorMap(entries: SerializedColorMap): Map<string, [number, number, number]> {
  return new Map(entries);
}

export function serializeCpuAtlas(atlas: CpuTextureAtlas): SerializedCpuAtlas {
  return {
    pixels: atlas.pixels,
    width: atlas.width,
    height: atlas.height,
    cols: atlas.cols,
    rows: atlas.rows,
    cellSize: atlas.cellSize,
    indexByName: [...atlas.indexByName.entries()],
  };
}

export function deserializeCpuAtlas(data: SerializedCpuAtlas): CpuTextureAtlas {
  return {
    pixels: data.pixels,
    width: data.width,
    height: data.height,
    cols: data.cols,
    rows: data.rows,
    cellSize: data.cellSize,
    indexByName: new Map(data.indexByName),
  };
}

export function mat4ToFloat32(m: mat4): Float32Array {
  return new Float32Array(m);
}

export function buildSectorLightArray(
  sectors: ReadonlyArray<{ lightlevel: number }>,
  timeSeconds: number,
  getLight: (sector: { lightlevel: number }, time: number) => number
): Float32Array {
  const out = new Float32Array(256);
  for (let i = 0; i < sectors.length && i < 256; i++) {
    out[i] = getLight(sectors[i], timeSeconds) / 255;
  }
  return out;
}
