import type { LineDef } from '@/wad/interfaces/LineDef';
import type { Sector } from '@/wad/interfaces/Sector';
import type { Thing } from '@/wad/interfaces/Thing';
import type { WadMap } from '@/wad/interfaces/WadMap';

const DEFAULT_FLAGS: LineDef['flags'] = {
  impassible: false,
  blockMonsters: false,
  twoSided: true,
  upperUnpegged: false,
  lowerUnpegged: true,
  secret: false,
  blockSound: false,
  notOnMap: false,
  alreadyOnMap: false,
};

export function sector(
  floorheight: number,
  ceilingheight: number,
  tag = 0,
  overrides: Partial<Sector> = {}
): Sector {
  return {
    floorheight,
    ceilingheight,
    floorpic: 'FLOOR0_1',
    ceilingpic: 'CEIL1_1',
    lightlevel: 255,
    type: 0,
    tag,
    ...overrides,
  };
}

export function lineDef(
  special: number,
  tag: number,
  overrides: Partial<LineDef> = {}
): LineDef {
  return {
    v1: 0,
    v2: 1,
    special,
    tag,
    sidenum: [0, 1],
    flags: { ...DEFAULT_FLAGS },
    ...overrides,
  };
}

/** Manual door: sector 0 = room, sector 1 = door pocket (back of trigger line). */
export function createManualDoorMap(special: number, doorHeights = { floor: 0, ceil: 8 }): WadMap {
  const room = sector(0, 128, 0);
  const door = sector(doorHeights.floor, doorHeights.ceil, 0);
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    LINEDEFS: [lineDef(special, 0)],
    SIDEDEFS: [
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: 'DOOR3' },
    ],
    SECTORS: [room, door],
  } as unknown as WadMap;
}

/** Remote door / mover: sector 0 = trigger room, sector 1 = tagged target. */
export function createTaggedActionMap(
  special: number,
  tag: number,
  target: Sector,
  triggerRoom = sector(0, 128, 0)
): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    LINEDEFS: [lineDef(special, tag)],
    SIDEDEFS: [
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
    ],
    SECTORS: [triggerRoom, target],
  } as unknown as WadMap;
}

/** Switch with SW1 / SW2 textures on the activating linedef. */
export function createSwitchMap(special: number, tag: number, target: Sector): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    LINEDEFS: [lineDef(special, tag)],
    SIDEDEFS: [
      {
        sector: 0,
        xOffset: 0,
        yOffset: 0,
        upperTexture: '-',
        lowerTexture: '-',
        middleTexture: 'SW1BRCOM',
      },
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
    ],
    SECTORS: [sector(0, 128, 0), target],
  } as unknown as WadMap;
}

/** Teleport: walk line tags sector 1; thing 14 in sector 1 is landing. */
export function createTeleportMap(special: number, tag: number): WadMap {
  const landing: Thing = {
    x: 32,
    y: 32,
    angle: 0,
    type: 14,
    flags: {
      skill1: true,
      skill2: true,
      skill3: true,
      skill4: true,
      skill5: true,
      ambush: false,
      single: true,
      dm: false,
      coop: false,
    },
  };
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
      { x: 0, y: 64 },
    ],
    LINEDEFS: [
      lineDef(special, tag, { v1: 0, v2: 1 }),
      { v1: 1, v2: 2, special: 0, tag: 0, sidenum: [2, 3], flags: { ...DEFAULT_FLAGS, twoSided: true } },
      { v1: 2, v2: 3, special: 0, tag: 0, sidenum: [4, 5], flags: { ...DEFAULT_FLAGS, twoSided: true } },
      { v1: 3, v2: 0, special: 0, tag: 0, sidenum: [6, 7], flags: { ...DEFAULT_FLAGS, twoSided: true } },
    ],
    SIDEDEFS: Array.from({ length: 8 }, (_, i) => ({
      sector: i < 4 ? 0 : 1,
      xOffset: 0,
      yOffset: 0,
      upperTexture: '-',
      lowerTexture: '-',
      middleTexture: '-',
    })),
    SECTORS: [sector(0, 128, 0), sector(0, 128, tag)],
    THINGS: [landing],
  } as unknown as WadMap;
}

/** Two-sector stair run (special on shared edge; back = sector 1). */
export function createStairPairMap(special: number): WadMap {
  const low = sector(0, 128, 0);
  const high = sector(0, 128, 0);
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
      { x: 0, y: 64 },
    ],
    LINEDEFS: [
      lineDef(special, 0, { v1: 0, v2: 1 }),
      { v1: 1, v2: 2, special: 0, tag: 0, sidenum: [2, 3], flags: { ...DEFAULT_FLAGS, twoSided: true } },
      { v1: 2, v2: 3, special: 0, tag: 0, sidenum: [4, 5], flags: { ...DEFAULT_FLAGS, twoSided: true } },
      { v1: 3, v2: 0, special: 0, tag: 0, sidenum: [6, 7], flags: { ...DEFAULT_FLAGS, twoSided: true } },
    ],
    SIDEDEFS: [
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
    ],
    SECTORS: [low, high],
  } as unknown as WadMap;
}

/** Donut: tagged pillar (sector 1, back of line) + outer ring sector 0. */
export function createDonutMap(special: number, tag: number): WadMap {
  const outer = sector(0, 128, tag);
  const pillar = sector(0, 64, tag);
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 0, y: 64 },
    ],
    LINEDEFS: [
      lineDef(special, tag, { v1: 0, v2: 1 }),
      { v1: 1, v2: 2, special: 0, tag: 0, sidenum: [2, 3], flags: { ...DEFAULT_FLAGS, twoSided: true } },
      { v1: 2, v2: 0, special: 0, tag: 0, sidenum: [4, 5], flags: { ...DEFAULT_FLAGS, twoSided: true } },
    ],
    SIDEDEFS: [
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: 'SW1BRCOM' },
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
    ],
    SECTORS: [outer, pillar],
  } as unknown as WadMap;
}

/** Two tagged sectors: floor 0 and floor 20 (nhEF tests). */
/** Transfer (TX): line tag 0; back sector 1 carries the remote tag. */
export function createTransferTaggedMap(special: number, sectorTag: number): WadMap {
  const map = createNhEFPairMap(special, 0);
  map.SECTORS[0] = sector(0, 128, sectorTag);
  map.SECTORS[1] = sector(20, 128, sectorTag);
  map.LINEDEFS[0].tag = 0;
  map.LINEDEFS[0].special = special;
  return map;
}

export function createNhEFPairMap(special: number, tag: number): WadMap {
  const map = createStairPairMap(special);
  map.SECTORS[0] = sector(0, 128, tag);
  map.SECTORS[1] = sector(20, 128, tag);
  map.LINEDEFS[0].tag = tag;
  map.LINEDEFS[0].special = special;
  return map;
}

export function createLightTagMap(special: number, tag: number, light = 80): WadMap {
  const dark = sector(0, 128, tag, { lightlevel: light });
  const bright = sector(0, 128, 0, { lightlevel: 200 });
  return createTaggedActionMap(special, tag, dark, bright);
}
