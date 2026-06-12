import { describe, expect, it } from 'vitest';
import { shouldRenderFullscreenSkybox } from './sectorSkyVisibility';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import { SectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';

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

  it('shows skybox when the camera sector has a sky flat', () => {
    const map = {
      SECTORS: [
        { ceilingpic: 'CEIL3_5', floorpic: 'FLOOR0_1' } as Sector,
        { ceilingpic: 'F_SKY1', floorpic: 'FLOOR0_1' } as Sector,
      ],
    } as unknown as WadMap;
    expect(shouldRenderFullscreenSkybox(map, 1, new Set([0, 1]))).toBe(true);
    expect(shouldRenderFullscreenSkybox(map, 0, new Set([0, 1]))).toBe(true);
    expect(shouldRenderFullscreenSkybox(map, 0, new Set([0]))).toBe(false);
  });

  it('does not show skybox for indoor camera with no sky in portal visibility', () => {
    const map = {
      SECTORS: [
        { ceilingpic: 'CEIL3_5', floorpic: 'FLOOR0_1' } as Sector,
        { ceilingpic: 'F_SKY1', floorpic: 'FLOOR7_1' } as Sector,
      ],
    } as unknown as WadMap;
    const index: SectorVisibilityIndex = {
      subsectorToSector: [],
      sectorBounds: [
        { minX: 0, maxX: 64, minY: 0, maxY: 64 },
        { minX: 128, maxX: 256, minY: 0, maxY: 64 },
      ],
      sectorAdjacency: [[], []],
    };
    expect(
      shouldRenderFullscreenSkybox(map, 0, new Set([0]), index, 32, 32)
    ).toBe(false);
  });
});
