import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { DoorSystem } from '@/wad/game/doorSystem';
import { decodeDoomSound } from '@/features/level-viewer/sfx/doomSfxPlayer';
import { LineDef } from '@/wad/interfaces/LineDef';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';

describe('DoorSystem', () => {
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
