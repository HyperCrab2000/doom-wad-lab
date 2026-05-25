import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { applyOccupancyVisibility, loadKvxSlab6Full } from '@/wad/parser/kvxLoader';
import { buildKvxSurfaceMesh } from '@/wad/voxels/kvxMesh';

const voxelRoot = join(process.cwd(), 'public/voxels');

function loadPublicKvx(name: string) {
  const buf = readFileSync(join(voxelRoot, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function faceCount(vis: number) {
  return [1, 2, 4, 8, 16, 32].filter((bit) => vis & bit).length;
}

describe('KVX visibility', () => {
  it('marks all six faces on an isolated voxel', async () => {
    const model = await loadKvxSlab6Full(loadPublicKvx('ELECA.kvx'));
    const isolated = model.voxdata.find((voxel) => faceCount(voxel.vis) === 6);
    expect(isolated).toBeDefined();
  });

  it('builds a much denser mesh for ELECA than flood-fill visibility did', async () => {
    const model = await loadKvxSlab6Full(loadPublicKvx('ELECA.kvx'));
    const mesh = buildKvxSurfaceMesh(model);
    const totalFaces = model.voxdata.reduce((sum, voxel) => sum + faceCount(voxel.vis), 0);

    expect(totalFaces).toBeGreaterThan(30000);
    expect(mesh.indices.length / 3).toBeGreaterThan(50000);
  });

  it('matches occupancy visibility for every voxel', async () => {
    const model = await loadKvxSlab6Full(loadPublicKvx('SARGA.kvx'));
    const scratch = model.voxdata.map((voxel) => ({ ...voxel, vis: 0 }));
    applyOccupancyVisibility(scratch, model.xsiz, model.ysiz, model.zsiz);

    for (let i = 0; i < model.voxdata.length; i++) {
      expect(model.voxdata[i].vis).toBe(scratch[i].vis);
    }
  });
});
