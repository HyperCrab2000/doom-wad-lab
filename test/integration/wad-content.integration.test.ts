import { describe, expect, it } from 'vitest';
import { buildWadAssetCatalog } from '@/wad/catalog/wadAssetCatalog';
import { IMPLEMENTED_LINE_SPECIALS } from '@/wad/game/lineSpecialRegistry';
import { hasIntegrationIwad, loadWadFixture } from './helpers/wadFixtures';

describe.skipIf(!hasIntegrationIwad())('WAD content catalog (IWAD)', () => {
  it('inventories sounds, music, sprites, and story lumps from DOOM2', () => {
    const { wad } = loadWadFixture('public/wads/DOOM2.WAD', 'wads/DOOM2.WAD');
    const catalog = buildWadAssetCatalog(wad);

    expect(catalog.sounds.length).toBeGreaterThan(80);
    expect(catalog.music.length).toBeGreaterThan(20);
    expect(catalog.sprites.length).toBeGreaterThan(100);
    expect(catalog.maps.length).toBeGreaterThan(30);
    expect(catalog.sounds.every((s) => s.decodable)).toBe(true);

    const map01 = catalog.maps.find((m) => m.mapName === 'MAP01');
    expect(map01?.musicLumpPresent).toBe('D_RUNNIN');
    expect(map01?.thingTypes.some((t) => t.type === 1)).toBe(true);
  });

  it('aligns line-special implementation count with registry', () => {
    expect(IMPLEMENTED_LINE_SPECIALS.length).toBeGreaterThan(100);
  });
});
