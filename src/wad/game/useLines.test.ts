import { describe, expect, it } from 'vitest';
import { doomUseDistance, findUseLine, isOnFrontSide } from '@/wad/game/useLines';
import { LineDef } from '@/wad/interfaces/LineDef';
import { WadMap } from '@/wad/interfaces/WadMap';

describe('findUseLine', () => {
  it('finds a nearby switch line when the player stands on the front side', () => {
    const map = createSwitchMap();
    const target = findUseLine(map, { x: 32, y: 16 });
    expect(target?.lineIndex).toBe(0);
  });

  it('ignores switch lines when the player is on the back side', () => {
    const map = createSwitchMap();
    expect(findUseLine(map, { x: 32, y: -16 })).toBeNull();
  });

  it('still finds a switch when yaw points away but no other candidate is in view', () => {
    const map = createSwitchMap();
    const target = findUseLine(map, { x: 32, y: 16 }, { yaw: Math.PI });
    expect(target?.lineIndex).toBe(0);
  });
});

describe('isOnFrontSide', () => {
  it('matches Doom P_PointOnLineSide for a horizontal linedef', () => {
    const v1 = { x: 0, y: 0 };
    const v2 = { x: 64, y: 0 };
    expect(isOnFrontSide({ x: 32, y: 16 }, v1, v2)).toBe(true);
    expect(isOnFrontSide({ x: 32, y: -16 }, v1, v2)).toBe(false);
  });
});

describe('doomUseDistance', () => {
  it('returns zero for a point on the segment', () => {
    const v1 = { x: 0, y: 0 };
    const v2 = { x: 64, y: 0 };
    expect(doomUseDistance({ x: 32, y: 0 }, v1, v2)).toBe(0);
  });

  it('uses Manhattan distance approximation from Doom', () => {
    const v1 = { x: 0, y: 0 };
    const v2 = { x: 64, y: 0 };
    expect(doomUseDistance({ x: 32, y: 64 }, v1, v2)).toBe(128);
    expect(doomUseDistance({ x: 32, y: 64 }, v1, v2)).toBeLessThanOrEqual(64 + 64);
  });
});

function createSwitchMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    LINEDEFS: [switchLine(1, 0)],
    SIDEDEFS: [
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: 'SW1BRCOM' },
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: 'DOOR3' },
    ],
    SECTORS: [
      { floorheight: 0, ceilingheight: 128, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL1_1', lightlevel: 255, type: 0, tag: 0 },
      { floorheight: 0, ceilingheight: 96, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL1_1', lightlevel: 255, type: 0, tag: 0 },
    ],
  } as unknown as WadMap;
}

function switchLine(special: number, tag: number, v1 = 0, v2 = 1): LineDef {
  return {
    v1,
    v2,
    special,
    tag,
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
  };
}
