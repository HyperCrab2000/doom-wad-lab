import { describe, expect, it } from 'vitest';
import { FloorMoverSystem } from '@/wad/game/floorMoverSystem';
import { LineDef } from '@/wad/interfaces/LineDef';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';

describe('FloorMoverSystem', () => {
  it('raises a tagged floor for switch special 101', () => {
    const platSector = sector(0, 32, 5);
    const room = sector(0, 128, 0);
    const map = createTaggedMap(platSector, room, 101, 5);
    const system = new FloorMoverSystem(map);

    const result = system.tryUseLine(0, map.LINEDEFS[0]);
    expect(result.triggered).toBe(true);
    system.tick(2);
    expect(platSector.floorheight).toBeGreaterThan(32);
    expect(system.isDirty()).toBe(true);
  });

  it('runs a lift plat down then up for walk special 10', () => {
    const platSector = sector(64, 128, 3);
    const low = sector(0, 64, 0);
    const map = createTaggedMap(platSector, low, 10, 3);
    const system = new FloorMoverSystem(map);

    expect(system.tryWalkLine(0, map.LINEDEFS[0]).triggered).toBe(true);
    for (let i = 0; i < 120 && system.getActiveMoverCount() > 0; i++) {
      system.tick(0.05);
    }
    expect(platSector.floorheight).toBeGreaterThan(0);
  });

});

function createTaggedMap(
  target: Sector,
  neighbor: Sector,
  special: number,
  tag: number
): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    LINEDEFS: [
      {
        v1: 0,
        v2: 1,
        special,
        tag,
        sidenum: [0, 1],
        flags: { twoSided: true },
      },
    ],
    SIDEDEFS: [
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
    ],
    SECTORS: [target, neighbor],
  } as unknown as WadMap;
}

function sector(floorheight: number, ceilingheight: number, tag: number): Sector {
  return {
    floorheight,
    ceilingheight,
    floorpic: 'FLOOR0_1',
    ceilingpic: 'CEIL1_1',
    lightlevel: 255,
    type: 0,
    tag,
  };
}
