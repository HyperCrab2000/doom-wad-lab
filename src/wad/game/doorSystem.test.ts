import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { DoorSystem } from '@/wad/game/doorSystem';
import { decodeDoomSound } from '@/features/level-viewer/sfx/doomSfxPlayer';
import { LineDef } from '@/wad/interfaces/LineDef';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';

describe('DoorSystem', () => {
  it('blocks keyed doors when the player lacks the key', () => {
    const doorSector = sector(0, 8, 0);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(doorSector, roomSector, 26, 0);
    const system = new DoorSystem(map, () => ({ blue: false, red: false, yellow: false }));

    expect(system.tryUseLine(0, map.LINEDEFS[0]).triggered).toBe(false);
    const withKey = new DoorSystem(map, () => ({ blue: true, red: false, yellow: false }));
    expect(withKey.tryUseLine(0, map.LINEDEFS[0]).triggered).toBe(true);
  });

  it('raises the back sector ceiling when opening a manual switch door', () => {
    const doorSector = sector(0, 8, 0);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(doorSector, roomSector, 1, 0);
    const system = new DoorSystem(map);

    const result = system.tryUseLine(0, map.LINEDEFS[0]);
    expect(result.triggered).toBe(true);
    expect(result.playOpen).toBe(true);
    expect(system.isDirty()).toBe(true);

    system.tick(0.5);
    expect(doorSector.ceilingheight).toBeGreaterThan(8);
  });

  it('opens remote tagged sectors for walk-over specials', () => {
    const doorSector = sector(0, 8, 5);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(doorSector, roomSector, 2, 5);
    const system = new DoorSystem(map);

    const result = system.tryWalkLine(0, map.LINEDEFS[0]);
    expect(result.triggered).toBe(true);
    expect(result.playOpen).toBe(true);
    system.tick(1);
    expect(doorSector.ceilingheight).toBeGreaterThan(8);
  });

  it('runs open-wait-close without getting stuck in wait at the top', () => {
    const doorSector = sector(0, 8, 0);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(doorSector, roomSector, 1, 0);
    const system = new DoorSystem(map);

    system.tryUseLine(0, map.LINEDEFS[0]);

    for (let i = 0; i < 80 && doorSector.ceilingheight < 120; i++) {
      system.tick(0.1);
    }
    expect(doorSector.ceilingheight).toBeGreaterThan(100);
    expect(system.getActiveDoorCount()).toBe(1);

    system.tick(5);

    for (let i = 0; i < 120 && system.getActiveDoorCount() > 0; i++) {
      system.tick(0.1);
    }
    expect(doorSector.ceilingheight).toBeLessThanOrEqual(9);
    expect(system.getActiveDoorCount()).toBe(0);
  });

  it('ignores non-door specials and one-shot lines after first use', () => {
    const doorSector = sector(0, 8, 0);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(doorSector, roomSector, 1, 0);
    const system = new DoorSystem(map);

    expect(system.tryUseLine(0, { ...map.LINEDEFS[0], special: 0 }).triggered).toBe(false);

    const onceMap = createDoorMap(doorSector, roomSector, 31, 0);
    const onceSystem = new DoorSystem(onceMap);
    expect(onceSystem.tryUseLine(0, onceMap.LINEDEFS[0]).triggered).toBe(true);
    expect(onceSystem.tryUseLine(0, onceMap.LINEDEFS[0]).triggered).toBe(false);
  });

  it('omits switch sounds for walk activation', () => {
    const roomSector = sector(0, 128, 0);
    const walkDoor = sector(0, 8, 5);
    const walkMap = createDoorMap(walkDoor, roomSector, 2, 5);
    const walkSystem = new DoorSystem(walkMap);
    const walkResult = walkSystem.tryWalkLine(0, walkMap.LINEDEFS[0]);

    expect(walkResult.playSwitch).toBe(false);
    expect(walkResult.triggered).toBe(true);
    expect(walkResult.playOpen).toBe(true);
  });

  it('rejects close actions on already closed doors and toggles open doors shut', () => {
    const closedDoor = sector(0, 0, 0);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(closedDoor, roomSector, 42, 0);
    const system = new DoorSystem(map);

    expect(system.tryUseLine(0, map.LINEDEFS[0]).triggered).toBe(false);

    const openDoor = sector(0, 124, 0);
    const openMap = createDoorMap(openDoor, roomSector, 1, 0);
    const openSystem = new DoorSystem(openMap);
    const toggle = openSystem.tryUseLine(0, openMap.LINEDEFS[0]);

    expect(toggle.playClose).toBe(true);
  });

  it('runs close-wait-open and returns blaze door sounds for turbo specials', () => {
    const doorSector = sector(0, 120, 5);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(doorSector, roomSector, 16, 5);
    const system = new DoorSystem(map);

    const walk = system.tryWalkLine(0, map.LINEDEFS[0]);
    expect(walk.sound).toBe('door');
    expect(walk.playClose).toBe(true);

    for (let i = 0; i < 120 && doorSector.ceilingheight > 9; i++) {
      system.tick(0.05);
    }
    expect(doorSector.ceilingheight).toBeLessThanOrEqual(9);
    const turboMap = createDoorMap(sector(0, 8, 0), roomSector, 117, 0);
    const turbo = new DoorSystem(turboMap);
    const turboResult = turbo.tryUseLine(0, turboMap.LINEDEFS[0]);
    expect(turboResult.sound).toBe('blaze');
  });

  it('interrupts a waiting door when the switch is used again', () => {
    const doorSector = sector(0, 8, 0);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(doorSector, roomSector, 1, 0);
    const system = new DoorSystem(map);

    system.tryUseLine(0, map.LINEDEFS[0]);
    for (let i = 0; i < 80 && doorSector.ceilingheight < 120; i++) {
      system.tick(0.1);
    }
    system.tick(5);

    const interrupt = system.tryUseLine(0, map.LINEDEFS[0]);
    expect(interrupt.playClose).toBe(true);
  });

  it('tracks dirty sectors and clears them after upload', () => {
    const doorSector = sector(0, 8, 0);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(doorSector, roomSector, 1, 0);
    const system = new DoorSystem(map);

    system.tryUseLine(0, map.LINEDEFS[0]);
    system.tick(0.1);
    expect(system.getDirtySectors().has(1)).toBe(true);
    system.clearDirty();
    expect(system.isDirty()).toBe(false);
    expect(system.getDirtySectors().size).toBe(0);
  });

  it('skips remote doors without a line tag', () => {
    const doorSector = sector(0, 8, 0);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(doorSector, roomSector, 2, 0);
    const system = new DoorSystem(map);

    expect(system.tryWalkLine(0, map.LINEDEFS[0]).triggered).toBe(false);
  });

  it('closes an open door with a close-only special', () => {
    const doorSector = sector(0, 120, 5);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(doorSector, roomSector, 50, 5);
    const system = new DoorSystem(map);

    const result = system.tryUseLine(0, map.LINEDEFS[0]);
    expect(result.playClose).toBe(true);
    for (let i = 0; i < 80 && doorSector.ceilingheight > 1; i++) {
      system.tick(0.1);
    }
    expect(doorSector.ceilingheight).toBeLessThanOrEqual(1);
  });

  it('starts opening a partially closed open-wait-close door', () => {
    const doorSector = sector(0, 64, 0);
    const roomSector = sector(0, 128, 0);
    const map = createDoorMap(doorSector, roomSector, 1, 0);
    const system = new DoorSystem(map);

    const result = system.tryUseLine(0, map.LINEDEFS[0]);
    expect(result.playOpen).toBe(true);
    system.tick(0.5);
    expect(doorSector.ceilingheight).toBeGreaterThan(64);
  });
});

describe('decodeDoomSound', () => {
  it('decodes DSDOROPN from DOOM.WAD', () => {
    const buf = readFileSync(join(process.cwd(), 'public/wads/DOOM.WAD'));
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const num = dv.getInt32(4, true);
    const dirOff = dv.getInt32(8, true);
    let lumpOffset = 0;
    let lumpSize = 0;
    for (let i = 0; i < num; i++) {
      const o = dirOff + i * 16;
      const name = Buffer.from(buf.subarray(o + 8, o + 16)).toString('ascii').replace(/\0.*$/, '');
      if (name === 'DSDOROPN') {
        lumpOffset = dv.getInt32(o, true);
        lumpSize = dv.getInt32(o + 4, true);
        break;
      }
    }
    expect(lumpSize).toBeGreaterThan(32);
    const decoded = decodeDoomSound(buf.buffer.slice(buf.byteOffset + lumpOffset, buf.byteOffset + lumpOffset + lumpSize));
    expect(decoded?.samples.length).toBeGreaterThan(1000);
    expect(decoded?.sampleRate).toBeGreaterThan(0);
  });
});

function createDoorMap(doorSector: Sector, roomSector: Sector, special: number, tag: number): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    LINEDEFS: [line(special, tag)],
    SIDEDEFS: [
      { sector: 0, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: '-' },
      { sector: 1, xOffset: 0, yOffset: 0, upperTexture: '-', lowerTexture: '-', middleTexture: 'DOOR3' },
    ],
    SECTORS: [roomSector, doorSector],
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

function line(special: number, tag: number): LineDef {
  return {
    v1: 0,
    v2: 1,
    special,
    tag,
    sidenum: [0, 1],
    flags: {
      impassible: false,
      blockMonsters: false,
      twoSided: true,
      upperUnpegged: false,
      lowerUnpegged: true,
      secret: false,
      blockSound: false,
      notOnMap: false,
      alreadyOnMap: false,
    },
  };
}
