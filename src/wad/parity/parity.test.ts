import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { readGzstate } from '../../../gzstate/gzstateReader';
import { exportWadLabToGzstate } from './export/exportWadLabToGzstate';
import { buildLumpCatalog } from './export/buildLumpCatalog';
import { assertFullParity, runFullParity } from './compare/runFullParity';
import { encodeClassicLineFlags, encodeClassicThingFlags } from './encodeDoomFormats';

const FIXTURES = [
  {
    wadPath: path.join(process.cwd(), 'public/wads/DOOM.WAD'),
    mapName: 'E1M1',
    gzstatePath: path.join(process.cwd(), 'artifacts/gzrender-v2/gzdoom/E1M1.gzstate'),
  },
  {
    wadPath: path.join(process.cwd(), 'public/wads/DOOM2.WAD'),
    mapName: 'MAP01',
    gzstatePath: path.join(process.cwd(), 'artifacts/gzrender-v2/gzdoom/MAP01.gzstate'),
  },
] as const;

function loadWad(wadPath: string) {
  if (!fs.existsSync(wadPath)) return null;
  const raw = fs.readFileSync(wadPath);
  return loadWadFromArrayBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

function loadGzstateFixture(fixturePath: string) {
  if (!fs.existsSync(fixturePath)) return null;
  const raw = fs.readFileSync(fixturePath);
  return readGzstate(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

describe('encodeDoomFormats', () => {
  it('packs classic line and thing flags', () => {
    expect(encodeClassicLineFlags({
      impassible: true,
      blockMonsters: false,
      twoSided: true,
      upperUnpegged: false,
      lowerUnpegged: false,
      secret: false,
      blockSound: false,
      notOnMap: false,
      alreadyOnMap: false,
    })).toBe(0x05);

    expect(encodeClassicThingFlags({
      appearsOnEasy: true,
      appearsOnMedium: true,
      appearsOnHard: true,
      isDeaf: false,
      hideInSingleplayer: false,
      hideInDeathmatch: false,
      hideInCoop: false,
      difficulty: 0 as never,
    })).toBe(0x07);
  });
});

describe('exportWadLabToGzstate', () => {
  it('exports non-empty DOOM.WAD catalog and raster sections', () => {
    const wad = loadWad(FIXTURES[0].wadPath);
    if (!wad) return;

    const doc = exportWadLabToGzstate(wad, 'E1M1');
    expect(doc.lumpCatalog.length).toBeGreaterThan(1800);
    expect(doc.textureDefs.length).toBeGreaterThan(100);
    expect(doc.pnames.length).toBeGreaterThan(100);
    expect(doc.flatNames.length).toBeGreaterThan(100);
    expect(doc.spriteNames.length).toBeGreaterThan(100);
    expect(doc.musicNames.length).toBeGreaterThan(10);
    expect(doc.soundNames.length).toBeGreaterThan(10);
    expect(doc.patchRasters.length).toBe(doc.pnames.length);
    expect(doc.flatRasters.length).toBe(doc.flatNames.length);
    expect(doc.spriteRasters.length).toBe(doc.spriteNames.length);
    expect(doc.textureRasters.length).toBe(doc.textureDefs.length);
    expect(doc.vertices.length).toBe(470);
    expect(doc.things.length).toBeGreaterThan(100);
  });

  it('buildLumpCatalog entries have CRC32 and non-negative sizes', () => {
    const wad = loadWad(FIXTURES[0].wadPath);
    if (!wad) return;

    const strings: string[] = [];
    const catalog = buildLumpCatalog(wad, strings);
    expect(catalog.every((e) => e.byteLength >= 0)).toBe(true);
    expect(catalog.every((e) => e.crc32 !== 0 || e.byteLength === 0)).toBe(true);
  });
});

describe('WAD Lab vs GZDoom full parity', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.mapName} GZSTATE matches GZDoom dump on every section`, () => {
      const wad = loadWad(fixture.wadPath);
      const gzdoomDoc = loadGzstateFixture(fixture.gzstatePath);
      if (!wad || !gzdoomDoc) return;

      const wadLabDoc = exportWadLabToGzstate(wad, fixture.mapName);
      const result = runFullParity(wadLabDoc, gzdoomDoc);
      if (!result.identical) {
        // eslint-disable-next-line no-console
        console.log(`${fixture.mapName} parity failures:`, result.sections.filter((s) => !s.identical));
        // eslint-disable-next-line no-console
        console.log(result.summary);
      }
      assertFullParity(wadLabDoc, gzdoomDoc);
    });
  }
});
