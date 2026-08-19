import { describe, expect, it } from 'vitest';

import { ThingKind } from '@/wad/constants/ThingTypes';
import type { WadMap } from '@/wad/interfaces/WadMap';

import { findHitscanTarget } from './hitscanCombat';

describe('hitscanCombat', () => {
  it('prefers the closest visible target in the aim cone', () => {
    const map = openMap();
    const target = findHitscanTarget({
      map,
      originX: 0,
      originY: 0,
      originZ: 41,
      yaw: 0,
      candidates: [
        { thingIndex: 0, x: 300, y: 0, kind: ThingKind.Monster },
        { thingIndex: 1, x: 120, y: 0, kind: ThingKind.Monster },
      ],
    });
    expect(target?.thingIndex).toBe(1);
  });

  it('ignores targets hidden by a solid wall', () => {
    const map = walledMap();
    const target = findHitscanTarget({
      map,
      originX: 0,
      originY: 0,
      originZ: 41,
      yaw: 0,
      candidates: [{ thingIndex: 0, x: 200, y: 0, kind: ThingKind.Monster }],
    });
    expect(target).toBeNull();
  });
});

function openMap(): WadMap {
  return {
    VERTEXES: [],
    SECTORS: [],
    SIDEDEFS: [],
    LINEDEFS: [],
    THINGS: [],
  } as unknown as WadMap;
}

function walledMap(): WadMap {
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
