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
});
