import { describe, expect, it } from 'vitest';

import type { WadMap } from '@/wad/interfaces/WadMap';

import { hasHitscanLineOfSight, lineBlocksHitscanAtZ, raySegmentIntersectT } from './hitscanTrace';

describe('hitscanTrace', () => {
  it('detects segment crossing the ray', () => {
    const t = raySegmentIntersectT(0, 0, 100, 0, 50, -10, 50, 10);
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(0.5, 3);
  });

  it('blocks sight through a one-sided wall', () => {
    const map = wallMap();
    expect(hasHitscanLineOfSight(map, { x: 0, y: 0, z: 41 }, { x: 200, y: 0 })).toBe(false);
  });

  it('allows sight through a two-sided window at shoot height', () => {
    const map = windowMap();
    expect(lineBlocksHitscanAtZ(map, map.LINEDEFS[0], 41)).toBe(false);
    expect(hasHitscanLineOfSight(map, { x: 0, y: 0, z: 41 }, { x: 200, y: 0 })).toBe(true);
  });
});

function wallMap(): WadMap {
  return {
    VERTEXES: [
      { x: 64, y: -32 },
      { x: 64, y: 32 },
    ],
    SECTORS: [
      { floorheight: 0, ceilingheight: 128, floorpic: 'F', ceilingpic: 'C', lightlevel: 255, type: 0, tag: 0 },
      { floorheight: 0, ceilingheight: 128, floorpic: 'F', ceilingpic: 'C', lightlevel: 255, type: 0, tag: 0 },
    ],
    SIDEDEFS: [
      { xOffset: 0, yOffset: 0, topTexture: 'W', bottomTexture: '-', midTexture: '-', sector: 0 },
      { xOffset: 0, yOffset: 0, topTexture: 'W', bottomTexture: '-', midTexture: '-', sector: 1 },
    ],
    LINEDEFS: [
      {
        v1: 0,
        v2: 1,
        special: 0,
        sidenum: [0, -1],
        flags: {
          impassible: true,
          blockMonsters: false,
          twoSided: false,
          upperUnpegged: false,
          lowerUnpegged: false,
          secret: false,
          blockSound: false,
          notOnMap: false,
          alreadyOnMap: false,
        },
      },
    ],
    THINGS: [],
  } as unknown as WadMap;
}

function windowMap(): WadMap {
  return {
    VERTEXES: [
      { x: 64, y: -32 },
      { x: 64, y: 32 },
    ],
    SECTORS: [
      { floorheight: 0, ceilingheight: 128, floorpic: 'F', ceilingpic: 'C', lightlevel: 255, type: 0, tag: 0 },
      { floorheight: -56, ceilingheight: 216, floorpic: 'F', ceilingpic: 'C', lightlevel: 255, type: 0, tag: 0 },
    ],
    SIDEDEFS: [
      { xOffset: 0, yOffset: 0, topTexture: 'W', bottomTexture: 'W', midTexture: '-', sector: 0 },
      { xOffset: 0, yOffset: 0, topTexture: 'W', bottomTexture: 'W', midTexture: '-', sector: 1 },
    ],
    LINEDEFS: [
      {
        v1: 0,
        v2: 1,
        special: 0,
        sidenum: [0, 1],
        flags: {
          impassible: false,
          blockMonsters: false,
          twoSided: true,
          upperUnpegged: false,
          lowerUnpegged: false,
          secret: false,
          blockSound: false,
          notOnMap: false,
          alreadyOnMap: false,
        },
      },
    ],
    THINGS: [],
  } as unknown as WadMap;
}
