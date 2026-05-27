import { describe, expect, it } from 'vitest';
import { compareDoomMapNames, getNextMapName, LevelStatsTracker, percent } from './levelStats';
import { sector } from '../../../test/helpers/syntheticMaps';
import type { WadMap } from '@/wad/interfaces/WadMap';

describe('levelStats', () => {
  it('orders episode and MAP lumps', () => {
    expect(compareDoomMapNames('E1M2', 'E1M10')).toBeLessThan(0);
    expect(compareDoomMapNames('MAP02', 'MAP11')).toBeLessThan(0);
  });

  it('advances to the next map name', () => {
    expect(getNextMapName(['MAP01', 'MAP02', 'MAP03'], 'MAP01')).toBe('MAP02');
    expect(getNextMapName(['MAP01', 'MAP02'], 'MAP02')).toBeNull();
  });

  it('counts secrets and items from the map', () => {
    const map = {
      SECTORS: [sector(0, 128, 0), { ...sector(0, 128, 0), type: 9 }],
      THINGS: [],
      LINEDEFS: [],
      SIDEDEFS: [],
      VERTEXES: [],
    } as unknown as WadMap;

    const tracker = new LevelStatsTracker();
    tracker.reset(map);
    expect(tracker.snapshot().totals.secrets).toBe(1);
  });

  it('computes percentage with empty totals as 100', () => {
    expect(percent(0, 0)).toBe(100);
    expect(percent(1, 4)).toBe(25);
  });
});
