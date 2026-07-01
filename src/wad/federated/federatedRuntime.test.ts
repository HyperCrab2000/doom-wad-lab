import { describe, expect, it } from 'vitest';

import { GZTICK_PATCH } from '@hypercrab2000/doom-gzengine-core';

import { patchesFromDirtySectors } from '@/wad/federated/typescriptEngineBridge';
import type { WadMap } from '@/wad/interfaces/WadMap';

describe('typescriptEngineBridge', () => {
  it('emits sector height patches for dirty sectors', () => {
    const map = {
      SECTORS: [
        { floorheight: 0, ceilingheight: 128 },
        { floorheight: 24, ceilingheight: 96 },
      ],
    } as unknown as WadMap;

    const patches = patchesFromDirtySectors(map, new Set([1]));
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({
      type: GZTICK_PATCH.SECTOR_HEIGHT,
      sectorIndex: 1,
      floorHeight: 24,
      ceilingHeight: 96,
    });
  });
});
