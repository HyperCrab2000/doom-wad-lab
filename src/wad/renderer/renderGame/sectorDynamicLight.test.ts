import { describe, expect, it } from 'vitest';
import { getEffectiveSectorLightLevel } from './sectorDynamicLight';
import { Sector } from '@/wad/interfaces/Sector';

describe('getEffectiveSectorLightLevel', () => {
  it('strobes fast sectors', () => {
    const sector = { lightlevel: 200, type: 12 } as Sector;
    const a = getEffectiveSectorLightLevel(sector, 0);
    const b = getEffectiveSectorLightLevel(sector, 0.2);
    expect(a).not.toBe(b);
  });

  it('returns base level for normal sectors', () => {
    const sector = { lightlevel: 180, type: 0 } as Sector;
    expect(getEffectiveSectorLightLevel(sector, 1.5)).toBe(180);
  });

  it('blinks random sectors', () => {
    const sector = { lightlevel: 200, type: 1, floorheight: 0, ceilingheight: 128 } as Sector;
    const a = getEffectiveSectorLightLevel(sector, 0);
    const b = getEffectiveSectorLightLevel(sector, 0.5);
    expect(a).not.toBe(b);
  });

  it('oscillates sector type 8', () => {
    const sector = { lightlevel: 160, type: 8 } as Sector;
    const low = getEffectiveSectorLightLevel(sector, 0);
    const high = getEffectiveSectorLightLevel(sector, 1);
    expect(high).not.toBe(low);
  });
});
