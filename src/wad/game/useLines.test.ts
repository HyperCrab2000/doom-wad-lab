import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { doomUseDistance, findUseLine, isOnFrontSide } from '@/wad/game/useLines';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { LineDef } from '@/wad/interfaces/LineDef';
import { WadMap } from '@/wad/interfaces/WadMap';

describe('findUseLine', () => {
  it('finds a nearby switch line when the player stands on the front side', () => {
    const map = createSwitchMap();
    const target = findUseLine(map, { x: 32, y: -16 });
    expect(target?.lineIndex).toBe(0);
  });

  it('ignores switch lines when the player is on the back side', () => {
    const map = createSwitchMap();
    expect(findUseLine(map, { x: 32, y: 16 })).toBeNull();
  });

  it('still finds a switch when yaw points away but no other candidate is in view', () => {
    const map = createSwitchMap();
    const target = findUseLine(map, { x: 32, y: -16 }, { yaw: Math.PI });
    expect(target?.lineIndex).toBe(0);
  });
});

describe('isOnFrontSide', () => {
  it('matches Doom P_PointOnLineSide for a horizontal linedef', () => {
    const v1 = { x: 0, y: 0 };
    const v2 = { x: 64, y: 0 };
    expect(isOnFrontSide({ x: 32, y: -16 }, v1, v2)).toBe(true);
    expect(isOnFrontSide({ x: 32, y: 16 }, v1, v2)).toBe(false);
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

describe('E1M1 door use', () => {
  it('allows use from the room side of line 148 (BIGDOOR2)', () => {
    const map = loadE1M1();
    const line = map.LINEDEFS[148];
    const v1 = map.VERTEXES[line.v1];
    const v2 = map.VERTEXES[line.v2];
    const pos = { x: 1512, y: -2496 };
    const yaw = 0;

    expect(isOnFrontSide(pos, v1, v2)).toBe(true);
    expect(findUseLine(map, pos, { yaw })?.lineIndex).toBe(148);
  });
});

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

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
