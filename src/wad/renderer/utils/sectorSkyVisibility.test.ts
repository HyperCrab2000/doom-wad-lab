import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import {
  hasOutdoorSkyThroughOpening,
  isHangarLipSectorOccludingOutdoorSky,
  shouldRenderFullscreenSkybox,
  shouldSkipCeilingFlatForOutdoorSky,
  isHangarLipWallSectorOccludingOutdoorSky,
  shouldSuppressLipSectorForOutdoorSky,
} from './sectorSkyVisibility';

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

  it('shows skybox only when the camera sector has a sky flat', () => {
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
});

describe('E1M1 spawn sky opening', () => {
  const wadPath = path.join(process.cwd(), 'public/wads/DOOM.WAD');
  const wad = loadWadFromArrayBuffer(fs.readFileSync(wadPath).buffer);
  const map = wad.maps.E1M1;
  const index = buildBspRenderIndex(map)!;
  const sectorVisibility = buildSectorVisibilityIndex(map)!;
  const playerStart = map.THINGS.find((thing) => thing.type === 1)!;

  const state = buildGzdoomDrawState({
    map,
    buffers: {
      bspRenderIndex: index,
      sectorTriangles: {},
      triangleHash: null,
      sectorVisibility,
      wallRangesByLine: [],
      flats: [],
      subsectorFlats: mapToSubsectorFlats(map, index),
    } as never,
    viewX: playerStart.x,
    viewY: playerStart.y,
    viewYaw: (playerStart.angle * Math.PI) / 180,
    cameraPos: [playerStart.x, 41, -playerStart.y],
  })!;

  const skyPool = new Set(state.flatSupplementSectorOrder ?? []);
  const visibleFlats = state.visibleSectors;

  it('sees courtyard sky 42 in supplement but not as a drawn flat sector', () => {
    expect(skyPool.has(42)).toBe(true);
    expect(visibleFlats.has(42)).toBe(false);
    expect(hasOutdoorSkyThroughOpening(map, skyPool, visibleFlats)).toBe(true);
    expect(shouldRenderFullscreenSkybox(map, state.cameraSectorIndex, skyPool)).toBe(true);
  });

  it('skips lip-sector ceilings 27/28 that occlude the skybox through the hangar opening', () => {
    const cameraSector = map.SECTORS[state.cameraSectorIndex]!;
    for (const sectorIndex of [27, 28]) {
      const sector = map.SECTORS[sectorIndex]!;
      expect(isHangarLipSectorOccludingOutdoorSky(map, sectorIndex, state.cameraSectorIndex)).toBe(
        true,
      );
      expect(
        shouldSuppressLipSectorForOutdoorSky(
          map,
          sectorIndex,
          state.cameraSectorIndex,
          skyPool,
          visibleFlats,
        ),
      ).toBe(true);
      const flat = {
        sectorIndex,
        sector,
        flatName: sector.ceilingpic,
      };
      expect(
        shouldSkipCeilingFlatForOutdoorSky(
          map,
          flat,
          state.cameraSectorIndex,
          skyPool,
          visibleFlats,
          true,
        ),
      ).toBe(true);
    }
    expect(
      shouldSkipCeilingFlatForOutdoorSky(
        map,
        {
          sectorIndex: state.cameraSectorIndex,
          sector: cameraSector,
          flatName: cameraSector.ceilingpic,
        },
        state.cameraSectorIndex,
        skyPool,
        visibleFlats,
        true,
      ),
    ).toBe(true);
  });

  it('skips raised adjacent lip sectors 24 and 31 ceilings with tall ceilings above spawn', () => {
    for (const sectorIndex of [24, 31]) {
      expect(isHangarLipSectorOccludingOutdoorSky(map, sectorIndex, state.cameraSectorIndex)).toBe(
        true,
      );
    }
    expect(isHangarLipWallSectorOccludingOutdoorSky(map, 24, state.cameraSectorIndex)).toBe(false);
    expect(isHangarLipWallSectorOccludingOutdoorSky(map, 31, state.cameraSectorIndex)).toBe(true);
  });
});
