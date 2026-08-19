import { describe, expect, it } from 'vitest';

import type { WadMap } from '@/wad/interfaces/WadMap';
import type { WallTexture } from '@/wad/interfaces/WallTexture';

import { hwWallProcessSide } from '@/wad/renderer/bsp/hwWallProcess';

describe('hwWallProcessSide', () => {
  it('skips upper band when both sectors have sky ceilings at the same height', () => {
    const map = skyWindowMap();
    const bands = hwWallProcessSide({
      map,
      lineDef: map.LINEDEFS[0],
      sideDefIndex: 0,
      otherSideDefIndex: 1,
      texturesByName: {
        STARTAN3: texture(false),
      },
    });

    expect(bands.some((b) => b.part === 'upper')).toBe(false);
  });

  it('draws upper band between sky sectors when ceiling heights differ', () => {
    const map = skyPillarMap();
    const bands = hwWallProcessSide({
      map,
      lineDef: map.LINEDEFS[0],
      sideDefIndex: 0,
      otherSideDefIndex: 1,
      texturesByName: {
        CEMENT9: texture(false),
      },
    });

    const upper = bands.find((b) => b.part === 'upper');
    expect(upper).toBeDefined();
    expect(upper!.texName).toBe('CEMENT9');
    expect(upper!.bottom).toBe(64);
    expect(upper!.top).toBe(264);
  });

  it('skips upper band when both sectors have sky ceilings', () => {
    const map = windowFrameMap();
    const indoorBands = hwWallProcessSide({
      map,
      lineDef: map.LINEDEFS[0],
      sideDefIndex: 0,
      otherSideDefIndex: 1,
      texturesByName: {
        STARTAN3: texture(false),
      },
    });
    const outdoorBands = hwWallProcessSide({
      map,
      lineDef: map.LINEDEFS[0],
      sideDefIndex: 1,
      otherSideDefIndex: 0,
      texturesByName: {
        STARTAN3: texture(false),
      },
    });

    expect(indoorBands.some((b) => b.part === 'upper')).toBe(false);
    expect(outdoorBands.some((b) => b.part === 'upper')).toBe(true);
  });

  it('draws upper band from back ceiling to front ceiling with obstruction clamp', () => {
    const map = stepWindowMap();
    const bands = hwWallProcessSide({
      map,
      lineDef: map.LINEDEFS[0],
      sideDefIndex: 0,
      otherSideDefIndex: 1,
      texturesByName: {
        WALL: texture(false),
      },
    });

    const upper = bands.find((b) => b.part === 'upper');
    expect(upper).toBeDefined();
    expect(upper!.bottom).toBe(96);
    expect(upper!.top).toBe(128);
  });

  it('draws upper band on sky courtyard short wall when back ceiling is above front', () => {
    const map = skyCourtyardShortWallMap();
    const bands = hwWallProcessSide({
      map,
      lineDef: map.LINEDEFS[0],
      sideDefIndex: 0,
      otherSideDefIndex: 1,
      texturesByName: {
        STARTAN3: texture(false),
      },
    });

    const upper = bands.find((b) => b.part === 'upper');
    expect(upper).toBeDefined();
    expect(upper!.texName).toBe('STARTAN3');
    expect(upper!.bottom).toBe(24);
    expect(upper!.top).toBe(64);
  });

  it('draws full-height wall on aligned two-sided line with top texture (E1M1 line 46 class)', () => {
    const map = alignedTwoSidedPartitionMap();
    const bands = hwWallProcessSide({
      map,
      lineDef: map.LINEDEFS[0],
      sideDefIndex: 0,
      otherSideDefIndex: 1,
      texturesByName: {
        STARTAN3: texture(false),
      },
    });

    expect(bands).toHaveLength(1);
    expect(bands[0]!.part).toBe('mid');
    expect(bands[0]!.texName).toBe('STARTAN3');
    expect(bands[0]!.bottom).toBe(0);
    expect(bands[0]!.top).toBe(72);
  });

  it('draws lower band to back ceiling on raised platform (E1M1 line 146 class)', () => {
    const map = raisedPlatformLowerMap();
    const bands = hwWallProcessSide({
      map,
      lineDef: map.LINEDEFS[0],
      sideDefIndex: 0,
      otherSideDefIndex: 1,
      texturesByName: {
        STARTAN3: texture(false),
        STEP6: texture(false),
      },
    });

    const upper = bands.find((b) => b.part === 'upper');
    const lower = bands.find((b) => b.part === 'lower');
    expect(upper?.texName).toBe('STARTAN3');
    expect(upper?.bottom).toBe(72);
    expect(upper?.top).toBe(144);
    expect(lower?.texName).toBe('STEP6');
    expect(lower?.bottom).toBe(0);
    expect(lower?.top).toBe(72);
  });

  it('drops all bands when aligned crusher door opens', () => {
    const map = crusherDoorMap();
    const closed = hwWallProcessSide({
      map,
      lineDef: map.LINEDEFS[0],
      sideDefIndex: 0,
      otherSideDefIndex: 1,
      texturesByName: { DOOR3: texture(false), PLAT1: texture(false) },
    });
    expect(closed.length).toBeGreaterThan(0);

    map.SECTORS[1].ceilingheight = 128;
    const open = hwWallProcessSide({
      map,
      lineDef: map.LINEDEFS[0],
      sideDefIndex: 0,
      otherSideDefIndex: 1,
      texturesByName: { DOOR3: texture(false), PLAT1: texture(false) },
    });
    expect(open.length).toBe(0);
  });
});

function texture(transparent: boolean, width = 64, height = 128): WallTexture {
  return {
    name: 'WALL',
    width,
    height,
    transparent,
    graphics: {} as WallTexture['graphics'],
  };
}

function windowFrameMap(): WadMap {
  return {
    VERTEXES: [{ x: 0, y: 0 }, { x: 128, y: 0 }],
    SECTORS: [
      { floorheight: 0, ceilingheight: 72, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL3_5', lightlevel: 255, type: 0, tag: 0 },
      { floorheight: -56, ceilingheight: 216, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1', lightlevel: 255, type: 0, tag: 0 },
    ],
    SIDEDEFS: [
      { xOffset: 0, yOffset: 0, topTexture: 'STARTAN3', bottomTexture: 'STARTAN3', midTexture: '-', sector: 0 },
      { xOffset: 0, yOffset: 0, topTexture: 'STARTAN3', bottomTexture: 'STARTAN3', midTexture: '-', sector: 1 },
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

function stepWindowMap(): WadMap {
  return {
    VERTEXES: [{ x: 0, y: 0 }, { x: 128, y: 0 }],
    SECTORS: [
      { floorheight: 0, ceilingheight: 128, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL1_1', lightlevel: 255, type: 0, tag: 0 },
      { floorheight: 0, ceilingheight: 96, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL1_1', lightlevel: 255, type: 0, tag: 0 },
    ],
    SIDEDEFS: [
      { xOffset: 0, yOffset: 0, topTexture: 'WALL', bottomTexture: '-', midTexture: '-', sector: 0 },
      { xOffset: 0, yOffset: 0, topTexture: 'WALL', bottomTexture: '-', midTexture: '-', sector: 1 },
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

function skyWindowMap(): WadMap {
  return {
    VERTEXES: [{ x: 0, y: 0 }, { x: 128, y: 0 }],
    SECTORS: [
      { floorheight: 0, ceilingheight: 128, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1', lightlevel: 255, type: 0, tag: 0 },
      { floorheight: 0, ceilingheight: 128, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1', lightlevel: 255, type: 0, tag: 0 },
    ],
    SIDEDEFS: [
      { xOffset: 0, yOffset: 0, topTexture: 'STARTAN3', bottomTexture: '-', midTexture: '-', sector: 0 },
      { xOffset: 0, yOffset: 0, topTexture: 'STARTAN3', bottomTexture: '-', midTexture: '-', sector: 1 },
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

function skyPillarMap(): WadMap {
  return {
    VERTEXES: [{ x: 0, y: 0 }, { x: 128, y: 0 }],
    SECTORS: [
      { floorheight: 64, ceilingheight: 264, floorpic: 'FLAT4', ceilingpic: 'CEIL1_1', lightlevel: 255, type: 0, tag: 0 },
      { floorheight: 64, ceilingheight: 64, floorpic: 'FLAT4', ceilingpic: 'F_SKY1', lightlevel: 255, type: 0, tag: 0 },
    ],
    SIDEDEFS: [
      { xOffset: 0, yOffset: 0, topTexture: 'CEMENT9', bottomTexture: '-', midTexture: '-', sector: 0 },
      { xOffset: 0, yOffset: 0, topTexture: '-', bottomTexture: '-', midTexture: '-', sector: 1 },
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

function skyCourtyardShortWallMap(): WadMap {
  return {
    VERTEXES: [{ x: 0, y: 0 }, { x: 128, y: 0 }],
    SECTORS: [
      { floorheight: -56, ceilingheight: 24, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1', lightlevel: 255, type: 0, tag: 0 },
      { floorheight: -56, ceilingheight: 64, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1', lightlevel: 255, type: 0, tag: 0 },
    ],
    SIDEDEFS: [
      { xOffset: 0, yOffset: 0, topTexture: 'STARTAN3', bottomTexture: 'STARTAN3', midTexture: '-', sector: 0 },
      { xOffset: 0, yOffset: 0, topTexture: '-', bottomTexture: '-', midTexture: '-', sector: 1 },
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

function raisedPlatformLowerMap(): WadMap {
  return {
    VERTEXES: [{ x: 0, y: 0 }, { x: 128, y: 0 }],
    SECTORS: [
      { floorheight: 0, ceilingheight: 144, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL3_5', lightlevel: 255, type: 0, tag: 0 },
      { floorheight: 0, ceilingheight: 72, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL3_5', lightlevel: 255, type: 0, tag: 0 },
    ],
    SIDEDEFS: [
      { xOffset: 0, yOffset: 0, topTexture: 'STARTAN3', bottomTexture: 'STEP6', midTexture: '-', sector: 0 },
      { xOffset: 0, yOffset: 0, topTexture: '-', bottomTexture: '-', midTexture: '-', sector: 1 },
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

function alignedTwoSidedPartitionMap(): WadMap {
  return {
    VERTEXES: [{ x: 0, y: 0 }, { x: 128, y: 0 }],
    SECTORS: [
      { floorheight: 0, ceilingheight: 72, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL3_5', lightlevel: 255, type: 0, tag: 0 },
      { floorheight: 0, ceilingheight: 72, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL3_5', lightlevel: 255, type: 0, tag: 0 },
    ],
    SIDEDEFS: [
      { xOffset: 0, yOffset: 0, topTexture: 'STARTAN3', bottomTexture: 'STARTAN3', midTexture: '-', sector: 0 },
      { xOffset: 0, yOffset: 0, topTexture: '-', bottomTexture: '-', midTexture: '-', sector: 1 },
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

function crusherDoorMap(): WadMap {
  return {
    VERTEXES: [{ x: 0, y: 0 }, { x: 128, y: 0 }],
    SECTORS: [
      { floorheight: 0, ceilingheight: 128, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL1_1', lightlevel: 255, type: 0, tag: 0 },
      { floorheight: 0, ceilingheight: 0, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL1_1', lightlevel: 255, type: 0, tag: 0 },
    ],
    SIDEDEFS: [
      { xOffset: 0, yOffset: 0, topTexture: 'PLAT1', bottomTexture: '-', midTexture: '-', sector: 0 },
      { xOffset: 0, yOffset: 0, topTexture: 'PLAT1', bottomTexture: '-', midTexture: '-', sector: 1 },
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
