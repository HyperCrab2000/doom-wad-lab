import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { getVoxelFloorLift, getVoxelSpanHeight, loadKvxSlab6Full } from '@/wad/parser/kvxLoader';
import { buildKvxSurfaceMesh } from '@/wad/voxels/kvxMesh';

const voxelRoot = join(process.cwd(), 'public/voxels');

function loadPublicKvx(name: string) {
  const buf = readFileSync(join(voxelRoot, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function faceCount(vis: number) {
  return [1, 2, 4, 8, 16, 32].filter((bit) => vis & bit).length;
}

describe('real KVX assets', () => {
  it('loads ELECA with a solid surface shell', async () => {
    const model = await loadKvxSlab6Full(loadPublicKvx('ELECA.kvx'));
    const mesh = buildKvxSurfaceMesh(model);

    expect(model.voxdata.length).toBeGreaterThan(1000);
    expect(model.maxZ - model.minZ + 1).toBe(model.zsiz);

    const surfaceVoxels = model.voxdata.filter((voxel) => faceCount(voxel.vis) > 0);
    expect(surfaceVoxels.length / model.voxdata.length).toBeGreaterThan(0.05);
    expect(mesh.indices.length / 3).toBeGreaterThan(50000);
    expect(getVoxelSpanHeight(model)).toBe(model.zsiz);
    expect(getVoxelFloorLift(model)).toBeCloseTo(model.zpiv - model.boxCenterZ, 5);
  });

  it('produces identical parses when loaded concurrently', async () => {
    const buffer = loadPublicKvx('SARGA.kvx');
    const models = await Promise.all(Array.from({ length: 16 }, () => loadKvxSlab6Full(buffer)));
    const counts = new Set(models.map((model) => model.voxdata.length));
    expect(counts.size).toBe(1);
  });
});
