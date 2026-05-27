import { describe, expect, it } from 'vitest';
import { bfsSectorChain, getAdjacentSectorIndices, getSectorsByTag } from './sectorAdjacency';
import { createNhEFPairMap, createStairPairMap } from '../../../test/helpers/syntheticMaps';

describe('sectorAdjacency', () => {
  it('finds neighbors across two-sided lines', () => {
    const map = createStairPairMap(8);
    expect(getAdjacentSectorIndices(map, 0)).toContain(1);
    expect(getAdjacentSectorIndices(map, 1)).toContain(0);
  });

  it('orders a BFS chain from the trigger back sector', () => {
    const map = createStairPairMap(7);
    const chain = bfsSectorChain(map, 1, 4);
    expect(chain[0]).toBe(1);
    expect(chain.length).toBeGreaterThanOrEqual(2);
  });

  it('returns tagged sectors and ignores tag 0', () => {
    const map = createNhEFPairMap(18, 3);
    expect(getSectorsByTag(map, 0)).toEqual([]);
    expect(getSectorsByTag(map, 3).map((s) => s.sectorIndex).sort()).toEqual([0, 1]);
  });
});
