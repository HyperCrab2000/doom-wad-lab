import type { SceneTriangle } from './buildSceneTriangles';
import { SURFACE_FLAT_CEILING, SURFACE_FLAT_FLOOR } from './pathTraceConstants';
import { INVALID_ATLAS_INDEX, resolveAtlasIndex } from './textureAtlas';

/** 9 texels per triangle: 16-bit positions + UV/metadata slots. */
export const TRI_SLOTS = 9;
const TEX_WIDTH = 256;

export interface MapPackBounds {
  origin: [number, number, number];
  scale: [number, number, number];
}

export interface PackedSceneTriangles {
  /** RGBA8 triangle payload (Metal-safe; no float/integer samplers). */
  dataBytes: Uint8Array;
  colorData: Uint8Array;
  width: number;
  height: number;
  colorWidth: number;
  colorHeight: number;
  count: number;
  bounds: MapPackBounds;
}

function computeBounds(triangles: SceneTriangle[]): MapPackBounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const tri of triangles) {
    for (const v of [tri.v0, tri.v1, tri.v2]) {
      minX = Math.min(minX, v[0]);
      minY = Math.min(minY, v[1]);
      minZ = Math.min(minZ, v[2]);
      maxX = Math.max(maxX, v[0]);
      maxY = Math.max(maxY, v[1]);
      maxZ = Math.max(maxZ, v[2]);
    }
  }

  const pad = 8;
  return {
    origin: [minX - pad, minY - pad, minZ - pad],
    scale: [
      Math.max(maxX - minX + pad * 2, 1),
      Math.max(maxY - minY + pad * 2, 1),
      Math.max(maxZ - minZ + pad * 2, 1),
    ],
  };
}

function normalizeCoord(value: number, axis: 0 | 1 | 2, bounds: MapPackBounds): number {
  return (value - bounds.origin[axis]) / bounds.scale[axis];
}

function normU16(value: number, axis: 0 | 1 | 2, bounds: MapPackBounds): number {
  const t = Math.min(1, Math.max(0, normalizeCoord(value, axis, bounds)));
  return Math.round(t * 65535);
}

function encodeUv16(value: number): [number, number] {
  const scaled = Math.min(65535, Math.max(0, Math.round(value * 64)));
  return [scaled & 0xff, (scaled >> 8) & 0xff];
}

function writeUvPair(
  out: Uint8Array,
  texelIndex: number,
  u: number,
  v: number
): void {
  const [uLo, uHi] = encodeUv16(u);
  const [vLo, vHi] = encodeUv16(v);
  writeTexel(out, texelIndex, uLo, uHi, vLo, vHi);
}

function writeTexel(
  out: Uint8Array,
  texelIndex: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const base = texelIndex * 4;
  out[base] = r;
  out[base + 1] = g;
  out[base + 2] = b;
  out[base + 3] = a;
}

function writePosXY(out: Uint8Array, texelIndex: number, x: number, y: number, axisBounds: MapPackBounds): void {
  const x16 = normU16(x, 0, axisBounds);
  const y16 = normU16(y, 1, axisBounds);
  writeTexel(out, texelIndex, x16 & 0xff, (x16 >> 8) & 0xff, y16 & 0xff, (y16 >> 8) & 0xff);
}

function writePosZMeta(
  out: Uint8Array,
  texelIndex: number,
  z: number,
  meta: number,
  axisBounds: MapPackBounds,
  flags = 0
): void {
  const z16 = normU16(z, 2, axisBounds);
  writeTexel(out, texelIndex, z16 & 0xff, (z16 >> 8) & 0xff, Math.min(255, meta), Math.min(255, flags));
}

function writePosZMeta16(
  out: Uint8Array,
  texelIndex: number,
  z: number,
  meta: number,
  axisBounds: MapPackBounds
): void {
  const z16 = normU16(z, 2, axisBounds);
  const m16 = Math.min(65535, Math.max(0, meta));
  writeTexel(out, texelIndex, z16 & 0xff, (z16 >> 8) & 0xff, m16 & 0xff, (m16 >> 8) & 0xff);
}

/** Decode a packed vertex for tests / diagnostics. */
export function decodePackedVertex(
  dataBytes: Uint8Array,
  triIndex: number,
  vertexSlot: 0 | 1 | 2,
  bounds: MapPackBounds
): [number, number, number] {
  const triBase = triIndex * TRI_SLOTS;
  const xySlot = triBase + vertexSlot * 2;
  const zSlot = triBase + vertexSlot * 2 + 1;
  const xyBase = xySlot * 4;
  const zBase = zSlot * 4;
  const x16 = dataBytes[xyBase] | (dataBytes[xyBase + 1] << 8);
  const y16 = dataBytes[xyBase + 2] | (dataBytes[xyBase + 3] << 8);
  const z16 = dataBytes[zBase] | (dataBytes[zBase + 1] << 8);
  return [
    bounds.origin[0] + (x16 / 65535) * bounds.scale[0],
    bounds.origin[1] + (y16 / 65535) * bounds.scale[1],
    bounds.origin[2] + (z16 / 65535) * bounds.scale[2],
  ];
}

export function packSceneTriangles(
  triangles: SceneTriangle[],
  wallColors: ReadonlyMap<string, [number, number, number]>,
  floorColors: ReadonlyMap<string, [number, number, number]>,
  atlasIndexByName: ReadonlyMap<string, number>,
  spriteColors: ReadonlyMap<string, [number, number, number]> = new Map()
): PackedSceneTriangles {
  const count = triangles.length;
  const bounds = computeBounds(triangles);
  const texels = Math.max(TRI_SLOTS, count * TRI_SLOTS);
  const height = Math.max(1, Math.ceil(texels / TEX_WIDTH));
  const dataBytes = new Uint8Array(TEX_WIDTH * height * 4);
  const colorWidth = TEX_WIDTH;
  const colorHeight = Math.max(1, Math.ceil(count / colorWidth));
  const colorData = new Uint8Array(colorWidth * colorHeight * 4);

  for (let i = 0; i < count; i++) {
    const tri = triangles[i];
    const triBase = i * TRI_SLOTS;
    const atlasIndex = resolveAtlasIndex(tri.texName, tri.surfaceKind, atlasIndexByName);
    const palette =
      tri.surfaceKind === SURFACE_FLAT_FLOOR || tri.surfaceKind === SURFACE_FLAT_CEILING
        ? floorColors
        : tri.surfaceKind === 2
          ? spriteColors
          : wallColors;
    const rgb = palette.get(tri.texName) ?? [0.45, 0.45, 0.45];

    writePosXY(dataBytes, triBase + 0, tri.v0[0], tri.v0[1], bounds);
    writePosZMeta(dataBytes, triBase + 1, tri.v0[2], tri.sectorIndex, bounds);
    writePosXY(dataBytes, triBase + 2, tri.v1[0], tri.v1[1], bounds);
    writePosZMeta(dataBytes, triBase + 3, tri.v1[2], tri.surfaceKind, bounds, tri.alphaClip ? 1 : 0);
    writePosXY(dataBytes, triBase + 4, tri.v2[0], tri.v2[1], bounds);
    writePosZMeta16(dataBytes, triBase + 5, tri.v2[2], atlasIndex, bounds);
    writeUvPair(dataBytes, triBase + 6, tri.uv0[0], tri.uv0[1]);
    writeUvPair(dataBytes, triBase + 7, tri.uv1[0], tri.uv1[1]);
    writeUvPair(dataBytes, triBase + 8, tri.uv2[0], tri.uv2[1]);

    const colorBase = i * 4;
    colorData[colorBase + 0] = Math.round(Math.min(1, rgb[0]) * 255);
    colorData[colorBase + 1] = Math.round(Math.min(1, rgb[1]) * 255);
    colorData[colorBase + 2] = Math.round(Math.min(1, rgb[2]) * 255);
    colorData[colorBase + 3] = 255;
  }

  return {
    dataBytes,
    colorData,
    width: TEX_WIDTH,
    height,
    colorWidth,
    colorHeight,
    count,
    bounds,
  };
}

export { TEX_WIDTH as TRIANGLE_TEX_WIDTH };
