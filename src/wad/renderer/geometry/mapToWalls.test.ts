import { describe, expect, it } from 'vitest';
import { WadMap } from '@/wad/interfaces/WadMap';
import { WallTexture } from '@/wad/interfaces/WallTexture';
import { mapToWalls } from './mapToWalls';

describe('mapToWalls', () => {
  it('marks two-sided transparent middle textures for the transparent render pass', () => {
    const walls = mapToWalls(twoSidedMidTextureMap(), {
      MIDGRATE: texture(true),
      BLAKWAL1: texture(false),
    });

    expect(walls).toHaveLength(2);
    expect(walls.every((wall) => wall.texName === 'MIDGRATE')).toBe(true);
    expect(walls.every((wall) => wall.transparent)).toBe(true);
    expect(walls.every((wall) => wall.twoSidedMiddle)).toBe(true);
    expect(walls.every((wall) => wall.repeatVertical === false)).toBe(true);
    expect(walls[0].normal[2]).toBeCloseTo(1);
    expect(walls[1].normal[2]).toBeCloseTo(-1);
  });

  it('caps vertical UV span for two-sided midtextures taller than the patch', () => {
    const walls = mapToWalls(tallTwoSidedMidTextureMap(), {
      MIDGRATE: texture(true, 64, 128),
      BLAKWAL1: texture(false, 64, 128),
    });

    expect(walls).toHaveLength(2);
    for (const wall of walls) {
      const minV = Math.min(wall.uv[1], wall.uv[3], wall.uv[5], wall.uv[7]);
      const maxV = Math.max(wall.uv[1], wall.uv[3], wall.uv[5], wall.uv[7]);
      expect(maxV - minV).toBeCloseTo(1, 5);
      expect(wall.repeatVertical).toBe(false);
    }
  });

  it('allows vertical UV span above 1 for one-sided walls taller than the patch', () => {
    const walls = mapToWalls(oneSidedTallWallMap(), {
      BRONZE1: texture(false, 64, 128),
    });

    expect(walls).toHaveLength(1);
    const wall = walls[0]!;
    const minV = Math.min(wall.uv[1], wall.uv[3], wall.uv[5], wall.uv[7]);
    const maxV = Math.max(wall.uv[1], wall.uv[3], wall.uv[5], wall.uv[7]);
    expect(maxV - minV).toBeCloseTo(208 / 128, 5);
    expect(wall.repeatVertical).not.toBe(false);
  });

  it('draws lower and upper walls on both sides of a height gap', () => {
    const walls = mapToWalls(windowFrameMap(), {
      STARTAN3: texture(false, 64, 128),
      BLAKWAL1: texture(false, 64, 128),
    });

    const indoorWalls = walls.filter((wall) => wall.sectorIndex === 0);
    expect(indoorWalls).toHaveLength(2);
    const lower = indoorWalls.find((wall) => wall.center[1] === -28)!;
    const upper = indoorWalls.find((wall) => wall.center[1] === 144)!;
    expect(lower.texName).toBe('STARTAN3');
    expect(upper.texName).toBe('STARTAN3');
    expect(lower.position![1]).toBe(-56);
    expect(lower.position![7]).toBe(0);
    expect(upper.position![1]).toBe(72);
    expect(upper.position![7]).toBe(216);
  });
});

function twoSidedMidTextureMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 128, y: 0 },
    ],
    SECTORS: [
      sector(0, 128),
      sector(0, 128),
    ],
    SIDEDEFS: [
      sideDef(0),
      sideDef(1),
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

function sector(floorheight: number, ceilingheight: number) {
  return {
    floorheight,
    ceilingheight,
    floorpic: 'FLOOR0_1',
    ceilingpic: 'CEIL1_1',
    lightlevel: 255,
    type: 0,
    tag: 0,
  };
}

function sideDef(sectorIndex: number) {
  return {
    xOffset: 0,
    yOffset: 0,
    topTexture: '-',
    bottomTexture: '-',
    midTexture: 'MIDGRATE',
    sector: sectorIndex,
  };
}

function texture(transparent: boolean, width = 64, height = 128): WallTexture {
  return {
    name: transparent ? 'MIDGRATE' : 'BLAKWAL1',
    width,
    height,
    transparent,
    graphics: {} as WallTexture['graphics'],
  };
}

function tallTwoSidedMidTextureMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 128, y: 0 },
    ],
    SECTORS: [sector(0, 208), sector(0, 208)],
    SIDEDEFS: [sideDef(0), sideDef(1)],
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

function oneSidedTallWallMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 128, y: 0 },
    ],
    SECTORS: [sector(56, 264)],
    SIDEDEFS: [
      {
        xOffset: 0,
        yOffset: 0,
        topTexture: '-',
        bottomTexture: '-',
        midTexture: 'BRONZE1',
        sector: 0,
      },
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

function windowFrameMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 128, y: 0 },
    ],
    SECTORS: [
      { ...sector(0, 72), ceilingpic: 'CEIL3_5' },
      { ...sector(-56, 216), ceilingpic: 'F_SKY1' },
    ],
    SIDEDEFS: [
      {
        xOffset: 0,
        yOffset: 0,
        topTexture: 'STARTAN3',
        bottomTexture: 'STARTAN3',
        midTexture: '-',
        sector: 0,
      },
      {
        xOffset: 0,
        yOffset: 0,
        topTexture: 'STARTAN3',
        bottomTexture: 'STARTAN3',
        midTexture: '-',
        sector: 1,
      },
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
