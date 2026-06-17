import { describe, expect, it } from 'vitest';

import {
  createVoxelCatalogView,
  mergeVoxelCatalogEntries,
  readVoxelDefTextsFromWad,
} from './voxelModCatalog';
import { parseVoxelDefs } from './voxelCatalog';
import { modVoxelAssetBases } from './resolveKvxBuffer';

describe('voxelModCatalog', () => {
  it('merges mod VOXELDEF entries over bundled catalog', () => {
    const patch = parseVoxelDefs(`CUSTOM = "CUSTOMA" {}`);
    const merged = mergeVoxelCatalogEntries([], patch);
    const view = createVoxelCatalogView(null);
    expect(merged).toHaveLength(1);
    expect(view.hasDefinitionForSprite('SARG')).toBe(true);
    expect(createVoxelCatalogView(null).getFramesForSprite('CUST').length).toBe(0);
  });

  it('reads VOXELDEF lumps from merged WAD stack', () => {
    const wad = {
      lumpInfo: [],
      lumpHash: {
        VOXELDEF: new TextEncoder().encode('SARGA = "SARGA" {}').buffer,
      },
    } as import('@/wad/interfaces/Wad').Wad;

    const texts = readVoxelDefTextsFromWad(wad);
    expect(texts).toHaveLength(1);
    expect(parseVoxelDefs(texts[0]!)[0]?.lumpName).toBe('SARGA');
  });
});

describe('resolveKvxBuffer mod bases', () => {
  it('derives voxel URL bases from mod paths', () => {
    expect(modVoxelAssetBases(['/mods/VoxelDoom.pk3', '/mods/extra.wad'])).toEqual([
      '/mods/voxels',
      '/mods/VoxelDoom/voxels',
      '/mods/extra/voxels',
    ]);
  });
});
