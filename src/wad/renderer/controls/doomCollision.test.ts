import { describe, expect, it } from 'vitest';
import { LineDef } from '@/wad/interfaces/LineDef';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import { ThingKind } from '@/wad/constants/ThingTypes';
import { Thing } from '@/wad/interfaces/Thing';
import {
  DOOM_RUN_SPEED,
  DOOM_WALK_SPEED,
  getBlockingCircles,
  approachWorldHeight,
  getDesiredVelocity,
  getBlockingSegments,
  getGroundStepSpeed,
  getLineOpening,
  getPlayerFeetZ,
  isBlockingLine,
  isBlockingLineForPlayer,
  isBlockingThing,
  isBlockingThingKind,
  isMovementKey,
  isSectorWalkable,
  isShiftHeld,
  moveCircleAgainstCircles,
  moveCircleAgainstObstacles,
  moveCircleAgainstSegments,
} from './doomCollision';

const lowSector = sector(0, 128);
const highStepSector = sector(32, 160);
const smallStepSector = sector(16, 128);
const lowCeilingSector = sector(0, 48);
const lowerSector = sector(-32, 128);

const baseMap = {
  VERTEXES: [
    { x: 0, y: 0 },
    { x: 128, y: 0 },
  ],
  SIDEDEFS: [{ sector: 0 }, { sector: 1 }],
  SECTORS: [lowSector, smallStepSector],
} as unknown as WadMap;

describe('Doom collision rules', () => {
  it('blocks one-sided and explicitly impassible lines', () => {
    expect(isBlockingLine(baseMap, line({ twoSided: false }, [0, -1]))).toBe(true);
    expect(isBlockingLine(baseMap, line({ twoSided: true, impassible: true }, [0, 1]))).toBe(true);
  });

  it('allows two-sided lines with valid step and clearance at floor level', () => {
    expect(isBlockingLine(baseMap, line({ twoSided: true }, [0, 1]))).toBe(false);
  });

  it('blocks two-sided lines with too-tall steps or low clearance at floor level', () => {
    const tallStepMap = { ...baseMap, SECTORS: [lowSector, highStepSector] } as unknown as WadMap;
    const lowClearanceMap = { ...baseMap, SECTORS: [lowSector, lowCeilingSector] } as unknown as WadMap;

    expect(isBlockingLine(tallStepMap, line({ twoSided: true }, [0, 1]))).toBe(true);
    expect(isBlockingLine(lowClearanceMap, line({ twoSided: true }, [0, 1]))).toBe(true);
  });

  it('allows jumping over tall steps when airborne', () => {
    const tallStepMap = { ...baseMap, SECTORS: [lowSector, highStepSector] } as unknown as WadMap;
    const opening = getLineOpening(tallStepMap, line({ twoSided: true }, [0, 1]))!;

    expect(opening.floor).toBe(32);
    expect(isBlockingLineForPlayer(tallStepMap, line({ twoSided: true }, [0, 1]), 0)).toBe(true);
    expect(
      isBlockingLineForPlayer(tallStepMap, line({ twoSided: true }, [0, 1]), opening.floor + 8)
    ).toBe(false);
  });

  it('checks sector walkability using Doomguy step and height', () => {
    expect(isSectorWalkable(lowSector, smallStepSector, false)).toBe(true);
    expect(isSectorWalkable(lowSector, highStepSector, false)).toBe(false);
    expect(isSectorWalkable(lowSector, lowCeilingSector, false)).toBe(false);
  });

  it('allows walking down ledges larger than the step height', () => {
    expect(isSectorWalkable(highStepSector, lowerSector, false)).toBe(true);
    expect(isSectorWalkable(highStepSector, lowSector, false)).toBe(true);
  });

  it('allows airborne sector transitions across large floor drops', () => {
    expect(isSectorWalkable(highStepSector, lowerSector, true)).toBe(true);
    expect(isSectorWalkable(highStepSector, lowerSector, false)).toBe(true);
  });

  it('uses Doom walk and run speeds', () => {
    expect(DOOM_WALK_SPEED).toBeCloseTo(291.66, 1);
    expect(DOOM_RUN_SPEED).toBeCloseTo(583.33, 1);
  });

  it('normalizes diagonal movement velocity', () => {
    const velocity = getDesiredVelocity(new Set(['KeyW', 'KeyD']), 0, 100);

    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(100);
  });

  it('captures mouselook movement keys including run and jump', () => {
    expect(isMovementKey('KeyW')).toBe(true);
    expect(isMovementKey('ShiftLeft')).toBe(true);
    expect(isMovementKey('Space')).toBe(true);
    expect(isMovementKey('KeyQ')).toBe(false);
    expect(isShiftHeld(new Set(['ShiftRight']))).toBe(true);
  });

  it('clips circle movement against blocking linedefs', () => {
    const map = {
      ...baseMap,
      LINEDEFS: [line({ twoSided: false }, [0, -1])],
    } as unknown as WadMap;
    const segments = getBlockingSegments(map, 0);
    const moved = moveCircleAgainstSegments({ x: 64, y: 20 }, { x: 0, y: -18 }, 16, segments);

    expect(moved.y).toBeGreaterThanOrEqual(16);
  });

  it('computes player feet height from world position', () => {
    expect(getPlayerFeetZ(sector(64, 128), 88)).toBe(88);
    expect(getPlayerFeetZ(sector(64, 128), 88, true)).toBe(64);
  });

  it('approaches floor height at a capped step rate', () => {
    expect(approachWorldHeight(0, 24, 8)).toBe(8);
    expect(approachWorldHeight(0, 24, 100)).toBe(24);
    expect(approachWorldHeight(20, 0, 8)).toBe(12);
  });

  it('scales step speed with horizontal movement', () => {
    expect(getGroundStepSpeed(0)).toBeGreaterThan(0);
    expect(getGroundStepSpeed(DOOM_RUN_SPEED)).toBeGreaterThan(getGroundStepSpeed(0));
  });

  it('treats monsters, barrels, and pickups as blocking thing kinds', () => {
    expect(isBlockingThingKind(ThingKind.Monster)).toBe(true);
    expect(isBlockingThingKind(ThingKind.Barrel)).toBe(true);
    expect(isBlockingThingKind(ThingKind.Pickup)).toBe(true);
    expect(isBlockingThingKind(ThingKind.Special)).toBe(false);
    expect(isBlockingThingKind(ThingKind.Player)).toBe(false);
  });

  it('blocks movement against solid things at the same height', () => {
    const imp = thing(3001, { appearsOnHard: true });
    expect(isBlockingThing(imp, 0, 0)).toBe(true);
  });

  it('allows passing over short things when airborne', () => {
    const clip = thing(2007, { appearsOnHard: true });
    expect(isBlockingThing(clip, 40, 0)).toBe(false);
  });

  it('clips circle movement against blocking things', () => {
    const moved = moveCircleAgainstCircles({ x: 0, y: 0 }, { x: 30, y: 0 }, 16, [
      { x: 30, y: 0, radius: 20 },
    ]);

    expect(moved.x).toBeCloseTo(-6, 0);
  });

  it('collects blocking circles from map things', () => {
    const map = {
      THINGS: [thing(3001, { appearsOnHard: true }, 64, 64)],
      SECTORS: [sector(0, 128)],
    } as unknown as WadMap;

    const circles = getBlockingCircles(map, 0, () => map.SECTORS[0]);
    expect(circles).toHaveLength(1);
    expect(circles[0].radius).toBe(20);
  });

  it('resolves lines and things in the same relaxation pass', () => {
    const map = {
      ...baseMap,
      THINGS: [thing(3001, { appearsOnHard: true }, 50, 0)],
    } as unknown as WadMap;
    const circles = getBlockingCircles(map, 0, () => map.SECTORS[0]);
    const free = moveCircleAgainstObstacles({ x: 0, y: 0 }, { x: 50, y: 0 }, 16, [], []);
    const blocked = moveCircleAgainstObstacles({ x: 0, y: 0 }, { x: 50, y: 0 }, 16, [], circles);

    expect(free.x).toBe(50);
    expect(blocked.x).toBeCloseTo(14, 0);
  });
});

function sector(floorheight: number, ceilingheight: number): Sector {
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

function line(flags: Partial<LineDef['flags']>, sidenum: [number, number]): LineDef {
  return {
    v1: 0,
    v2: 1,
    special: 0,
    sidenum,
    flags: {
      impassible: false,
      blockMonsters: false,
      twoSided: false,
      upperUnpegged: false,
      lowerUnpegged: false,
      secret: false,
      blockSound: false,
      notOnMap: false,
      alreadyOnMap: false,
      ...flags,
    },
  };
}

function thing(
  type: number,
  flags: Partial<Thing['flags']>,
  x = 0,
  y = 0
): Thing {
  return {
    x,
    y,
    angle: 0,
    type,
    flags: {
      difficulty: 2,
      isDeaf: false,
      hideInSingleplayer: false,
      ...flags,
    },
  };
}
