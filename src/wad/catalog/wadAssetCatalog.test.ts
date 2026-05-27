import { describe, expect, it } from 'vitest';
import { buildWadAssetCatalog } from './wadAssetCatalog';
import { parseDoomTextScreens, parseDmusinfo } from './parseDoomText';
import { categorizeWadLumpName } from './categorizeLump';
import { getThingTypeById } from './thingTypeIndex';

describe('wad asset catalog', () => {
  it('classifies common lump names', () => {
    expect(categorizeWadLumpName('DSPISTOL')).toBe('sound');
    expect(categorizeWadLumpName('D_RUNNIN')).toBe('music');
    expect(categorizeWadLumpName('TEXT1')).toBe('storyText');
    expect(categorizeWadLumpName('MAP01')).toBe('map');
    expect(categorizeWadLumpName('S_START')).toBe('marker');
  });

  it('parses doom text screens on underscore delimiter', () => {
    const buf = new TextEncoder().encode('First screen\n_\nSecond screen');
    const screens = parseDoomTextScreens(buf.buffer);
    expect(screens).toHaveLength(2);
    expect(screens[0]).toContain('First');
    expect(screens[1]).toContain('Second');
  });

  it('parses DMUSINFO pairs', () => {
    const buf = new TextEncoder().encode('MAP01 D_RUNNIN\nMAP02 D_STALKS');
    const entries = parseDmusinfo(buf.buffer);
    expect(entries).toEqual([
      { mapName: 'MAP01', musicLump: 'D_RUNNIN' },
      { mapName: 'MAP02', musicLump: 'D_STALKS' },
    ]);
  });

  it('resolves thing types by id', () => {
    const imp = getThingTypeById(3001);
    expect(imp?.sprite).toBe('TROO');
    expect(imp?.description).toContain('Imp');
  });

  it('builds a minimal catalog from lump hash', () => {
    const catalog = buildWadAssetCatalog({
      indentification: 'IWAD',
      lumpInfo: [],
      lumpHash: {
        DSPISTOL: new ArrayBuffer(16),
        D_RUNNIN: new TextEncoder().encode('MUS\x1a\x00').buffer,
        TEXT1: new TextEncoder().encode('Episode ends\n_\nNext screen').buffer,
      },
      playpal: { base: [], palettes: [] },
      colormap: [],
      enddoom: [],
      pnames: [],
      textures: { WALL: {} as never },
      sprites: { TROOA1: new ArrayBuffer(8) },
      flats: { FLOOR0_1: new ArrayBuffer(4096) },
      maps: {
        MAP01: {
          THINGS: [{ type: 3001, x: 0, y: 0, angle: 0, flags: {} as never }],
          LINEDEFS: [],
          SIDEDEFS: [],
          VERTEXES: [],
          SECTORS: [],
        } as never,
      },
      animatedFlats: {},
      animatedTextures: {},
    });

    expect(catalog.sounds).toHaveLength(1);
    expect(catalog.music[0]?.isMus).toBe(true);
    expect(catalog.storyTexts[0]?.screenCount).toBe(2);
    expect(catalog.maps[0]?.thingTypes[0]?.sprite).toBe('TROO');
  });
});
