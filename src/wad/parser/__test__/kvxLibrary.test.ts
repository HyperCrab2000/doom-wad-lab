import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { loadKvxSlab6Full } from '@/wad/parser/kvxLoader';
import { buildKvxSurfaceMesh } from '@/wad/voxels/kvxMesh';

const voxelRoot = join(process.cwd(), 'public/voxels');

function faceCount(vis: number) {
  return [1, 2, 4, 8, 16, 32].filter((bit) => vis & bit).length;
}

describe('public KVX library', () => {
  const kvxFiles = readdirSync(voxelRoot).filter((name) => name.toLowerCase().endsWith('.kvx'));

  it('loads every public KVX with surface geometry', async () => {
    expect(kvxFiles.length).toBeGreaterThan(100);

    const failures: string[] = [];

    for (const fileName of kvxFiles) {
      try {
        const buf = readFileSync(join(voxelRoot, fileName));
        const model = await loadKvxSlab6Full(
          buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        );
        const mesh = buildKvxSurfaceMesh(model);
        const visibleFaces = model.voxdata.reduce((sum, voxel) => sum + faceCount(voxel.vis), 0);

        if (model.voxdata.length === 0 || visibleFaces === 0 || mesh.indices.length === 0) {
          failures.push(`${fileName}: empty or invisible (${model.voxdata.length} voxels)`);
        }
      } catch (error) {
        failures.push(
          `${fileName}: ${error instanceof Error ? error.message : 'load failed'}`
        );
      }
    }

    expect(failures, failures.slice(0, 10).join('\n')).toEqual([]);
  }, 120_000);
});
