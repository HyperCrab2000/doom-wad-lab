import { describe, expect, it } from 'vitest';
import { collectMapAssetNames } from './collectMapAssets';
import type { Wad } from '@/wad/interfaces/Wad';
import type { WadMap } from '@/wad/interfaces/WadMap';

describe('collectMapAssetNames', () => {
  it('includes only map-used textures and loading UI patches', () => {
    const wad = {
      textures: {
        STARTAN3: { patches: [{ patchIndex: 0, originX: 0, originY: 0 }] },
        BROWN1: { patches: [{ patchIndex: 1, originX: 0, originY: 0 }] },
        UNUSED: { patches: [{ patchIndex: 2, originX: 0, originY: 0 }] },
      },
      flats: { FLOOR4_8: new ArrayBuffer(0), CEIL3_5: new ArrayBuffer(0) },
      sprites: { TROOA1: new ArrayBuffer(0), PLAYA1: new ArrayBuffer(0) },
      pnames: ['P_START', 'P_BROWN', 'P_UNUSED'],
      lumpHash: { TITLEPIC: new ArrayBuffer(0), STCFN076: new ArrayBuffer(0) },
      animatedTextures: {},
      animatedFlats: {},
    } as unknown as Wad;

    const map = {
      SECTORS: [{ floorpic: 'FLOOR4_8', ceilingpic: 'CEIL3_5' }],
      SIDEDEFS: [{ topTexture: '-', bottomTexture: 'STARTAN3', midTexture: '-' }],
      THINGS: [{ type: 3001 }],
      LINEDEFS: [],
      VERTEXES: [],
    } as unknown as WadMap;

    const names = collectMapAssetNames(wad, map, 'E1M1');

    expect(names.wallTextures.has('STARTAN3')).toBe(true);
    expect(names.wallTextures.has('UNUSED')).toBe(false);
    expect(names.flats.has('FLOOR4_8')).toBe(true);
    expect(names.patchLumps.has('TITLEPIC')).toBe(true);
    expect(names.patchLumps.has('STCFN076')).toBe(true);
    expect(names.patchLumps.has('P_START')).toBe(true);
    expect(names.spriteLumps.has('TROOA1')).toBe(true);
  });
});
