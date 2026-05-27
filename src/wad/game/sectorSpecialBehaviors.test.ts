import { describe, expect, it } from 'vitest';
import { sector } from '../../../test/helpers/syntheticMaps';
import type { Sector } from '@/wad/interfaces/Sector';
import {
  applySectorTypePresentation,
  getSectorDamage,
  getSectorPlayerEffects,
  getSectorScroll,
  getSectorTimedDoor,
  getSectorWind,
  isSecretSectorType,
} from './sectorSpecialRuntime';
import { SectorSpecialSystem } from './sectorSpecialSystem';
import type { WadMap } from '@/wad/interfaces/WadMap';

describe('sectorSpecialRuntime', () => {
  it('maps classic damage types', () => {
    expect(getSectorDamage(7)?.percentPerSecond).toBe(5);
    expect(getSectorDamage(16)?.percentPerSecond).toBe(20);
    expect(getSectorDamage(115)?.instantKill).toBe(true);
  });

  it('combines wind and scroll impulses for the player', () => {
    const s = { ...sector(0, 128, 0), type: 204 } as Sector;
    const fx = getSectorPlayerEffects(s);
    expect(fx.push.dx).toBeGreaterThan(0);
    expect(getSectorWind(40)?.dx).toBeGreaterThan(0);
    expect(getSectorScroll(118, 90)?.dx).not.toBe(0);
  });

  it('marks secret sectors', () => {
    expect(isSecretSectorType(9)).toBe(true);
    const fx = getSectorPlayerEffects({ ...sector(0, 128, 0), type: 9 } as Sector);
    expect(fx.isSecret).toBe(true);
  });

  it('applies liquid presentation for damage flats without textures', () => {
    const s = { ...sector(0, 128, 0), type: 82, floorpic: 'FLOOR0_1' } as Sector;
    applySectorTypePresentation(s);
    expect(s.liquidKind).toBe('lava');
  });

  it('reduces friction on type 79', () => {
    const fx = getSectorPlayerEffects({ ...sector(0, 128, 0), type: 79 } as Sector);
    expect(fx.frictionScale).toBeLessThan(1);
  });
});

describe('SectorSpecialSystem', () => {
  it('closes timed door ceilings after the delay', () => {
    const map = {
      SECTORS: [{ ...sector(0, 128, 0), type: 10 }],
      LINEDEFS: [],
      SIDEDEFS: [],
      VERTEXES: [],
    } as unknown as WadMap;

    expect(getSectorTimedDoor(10)?.delaySeconds).toBe(30);
    const system = new SectorSpecialSystem(map);
    system.tick(31);
    expect(map.SECTORS[0].ceilingheight).toBeLessThan(128);
    expect(system.isDirty()).toBe(true);
  });
});
