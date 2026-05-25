import { KvxModel, KvxVoxel } from '@/wad/parser/kvxLoader';

export interface KvxSurfaceMesh {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
}

const meshCache = new WeakMap<KvxModel, KvxSurfaceMesh>();

export function buildKvxSurfaceMesh(model: KvxModel): KvxSurfaceMesh {
  const cached = meshCache.get(model);
  if (cached) return cached;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (const voxel of model.voxdata) {
    const color = getBrightPaletteColor(model.palette, voxel.col);
    addVisibleVoxelFaces(model, voxel, color, positions, colors, indices);
  }

  const mesh: KvxSurfaceMesh = {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    indices:
      positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
  };
  meshCache.set(model, mesh);
  return mesh;
}

export function getBrightPaletteColor(palette: Uint8Array, colorIndex: number): [number, number, number] {
  const paletteIndex = Math.max(0, Math.min(255, colorIndex & 0xff));
  const r = palette[paletteIndex * 3] / 63;
  const g = palette[paletteIndex * 3 + 1] / 63;
  const b = palette[paletteIndex * 3 + 2] / 63;
  const brightness = Math.max(r, g, b);
  const lift = brightness < 0.42 ? 0.42 - brightness : 0;

  return [
    Math.min(1, r * 1.55 + lift),
    Math.min(1, g * 1.55 + lift),
    Math.min(1, b * 1.55 + lift),
  ];
}

function addVisibleVoxelFaces(
  model: KvxModel,
  voxel: KvxVoxel,
  color: [number, number, number],
  positions: number[],
  colors: number[],
  indices: number[]
) {
  const x0 = voxel.x - model.boxCenterX;
  const x1 = voxel.x + 1 - model.boxCenterX;
  const y0 = model.boxCenterZ - (voxel.z + 1);
  const y1 = model.boxCenterZ - voxel.z;
  const z0 = voxel.y - model.boxCenterY;
  const z1 = voxel.y + 1 - model.boxCenterY;

  if (voxel.vis & 1) addFace([[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], color, positions, colors, indices);
  if (voxel.vis & 2) addFace([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], color, positions, colors, indices);
  if (voxel.vis & 4) addFace([[x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0]], color, positions, colors, indices);
  if (voxel.vis & 8) addFace([[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], color, positions, colors, indices);
  if (voxel.vis & 16) addFace([[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]], color, positions, colors, indices);
  if (voxel.vis & 32) addFace([[x0, y1, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1]], color, positions, colors, indices);
}

function addFace(
  vertices: number[][],
  color: [number, number, number],
  positions: number[],
  colors: number[],
  indices: number[]
) {
  const offset = positions.length / 3;
  for (const vertex of vertices) {
    positions.push(vertex[0], vertex[1], vertex[2]);
    colors.push(color[0], color[1], color[2]);
  }
  indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
}
