import { GZSTATE_MAGIC, GZSTATE_VERSION } from '../../../../gzstate/constants';
import type { GzstateDocument } from '../../../../gzstate/types';
import type { Wad } from '@/wad/interfaces/Wad';

import {
  buildFlatNames,
  buildMusicNames,
  buildPnames,
  buildSoundNames,
  buildSpriteNames,
  buildTextureDefs,
} from './buildAssetSections';
import { buildLumpCatalog } from './buildLumpCatalog';
import {
  buildFlatRasterDigests,
  buildPatchRasterDigests,
  buildSpriteRasterDigests,
  buildTextureRasterDigests,
} from './buildRasterDigests';
import {
  buildLinedefs,
  buildNodes,
  buildSectors,
  buildSegs,
  buildSidedefs,
  buildSubsectors,
  buildThings,
  buildVertices,
} from './buildMapSections';

/**
 * Export WAD Lab parsed state into GZSTATE v1 for parity comparison with GZDoom.
 * Self-contained module boundary — can be extracted to a standalone library later.
 */
export function exportWadLabToGzstate(wad: Wad, mapName: string, engineTag = 'WADLAB'): GzstateDocument {
  const map = wad.maps[mapName.toUpperCase()];
  if (!map) {
    throw new Error(`Map not found in WAD: ${mapName}`);
  }

  const strings: string[] = [];

  return {
    header: {
      magic: GZSTATE_MAGIC,
      version: GZSTATE_VERSION,
      flags: 0,
      headerSize: 64,
      sectionCount: 0,
      sectionDirectoryOffset: 64,
      mapName: mapName.toUpperCase(),
      engineTag,
    },
    sections: [],
    strings,
    vertices: buildVertices(map),
    sectors: buildSectors(map, strings),
    sidedefs: buildSidedefs(map, strings),
    linedefs: buildLinedefs(map),
    segs: buildSegs(map),
    subsectors: buildSubsectors(map),
    nodes: buildNodes(map),
    things: buildThings(map),
    lumpCatalog: buildLumpCatalog(wad, strings),
    textureDefs: buildTextureDefs(wad, strings),
    flatNames: buildFlatNames(wad, strings),
    spriteNames: buildSpriteNames(wad, strings),
    musicNames: buildMusicNames(wad, strings),
    soundNames: buildSoundNames(wad, strings),
    pnames: buildPnames(wad, strings),
    patchRasters: buildPatchRasterDigests(wad, strings),
    flatRasters: buildFlatRasterDigests(wad, strings),
    spriteRasters: buildSpriteRasterDigests(wad, strings),
    textureRasters: buildTextureRasterDigests(wad, strings),
  };
}
