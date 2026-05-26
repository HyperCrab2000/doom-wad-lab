import { describe, expect, it } from 'vitest';
import { shouldRenderFullscreenSkybox } from './sectorSkyVisibility';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';

describe('shouldRenderFullscreenSkybox', () => {
  it('hides skybox for fully indoor camera with no outdoor visibility', () => {
    const map = {
      SECTORS: [
        { ceilingpic: 'CEIL3_5', floorpic: 'FLOOR0_1' },
        { ceilingpic: 'CEIL3_5', floorpic: 'FLOOR0_1' },
      ],
    } as unknown as WadMap;
    expect(shouldRenderFullscreenSkybox(map, 0, new Set([0]))).toBe(false);
  });

  it('shows skybox when outdoor sector is visible', () => {
    const map = {
      SECTORS: [
        { ceilingpic: 'CEIL3_5', floorpic: 'FLOOR0_1' } as Sector,
        { ceilingpic: 'F_SKY1', floorpic: 'FLOOR0_1' } as Sector,
      ],
    } as unknown as WadMap;
    expect(shouldRenderFullscreenSkybox(map, 0, new Set([0, 1]))).toBe(true);
  });
});
