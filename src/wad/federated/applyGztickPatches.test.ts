import { describe, expect, it } from 'vitest';

import { GZTICK_PATCH } from '@hypercrab2000/doom-gzengine-core';

import { applyGztickPatches } from '@/wad/federated/applyGztickPatches';
import { shouldRunFederatedSimulation } from '@/wad/federated/federatedSimulation';
import type { WadMap } from '@/wad/interfaces/WadMap';

describe('applyGztickPatches', () => {
  it('updates sector heights from SECTOR_HEIGHT patches', () => {
    const map = {
      SECTORS: [
        { floorheight: 0, ceilingheight: 128 },
        { floorheight: 0, ceilingheight: 72 },
      ],
      THINGS: [],
    } as unknown as WadMap;

    const result = applyGztickPatches(map, { renderableThings: [], sectorsByThing: new Map() }, [
      {
        type: GZTICK_PATCH.SECTOR_HEIGHT,
        sectorIndex: 1,
        floorHeight: 24,
        ceilingHeight: 96,
      },
    ]);

    expect(map.SECTORS[1]).toEqual({ floorheight: 24, ceilingheight: 96 });
    expect([...result.sectorIndices]).toEqual([1]);
  });

  it('updates thing position in map and renderableThings', () => {
    const thing = { x: 0, y: 0, angle: 90, type: 3004, flags: { difficulty: 0, isDeaf: false, hideInSingleplayer: false } };
    const map = {
      SECTORS: [],
      THINGS: [thing],
    } as unknown as WadMap;

    const renderableThings = [
      {
        thingObj: thing,
        thingIndex: 0,
        thingType: { sprite: 'TROO' },
        thingSector: { floorheight: 0, ceilingheight: 128 },
        sectorIndex: 0,
      },
    ] as ReturnType<typeof import('@/wad/renderer/renderGame/renderableThings').buildRenderableThings>;

    applyGztickPatches(
      map,
      { renderableThings, sectorsByThing: new Map() },
      [
        {
          type: GZTICK_PATCH.THING_MOVE,
          thingId: 0,
          x: 128,
          y: -64,
          z: 0,
          angle: 180,
        },
      ],
    );

    expect(thing).toMatchObject({ x: 128, y: -64, angle: 180 });
    expect(renderableThings[0].thingObj).toBe(thing);
  });
});

describe('shouldRunFederatedSimulation', () => {
  it('runs for classic and wasm-federated outside parity modes', () => {
    expect(
      shouldRunFederatedSimulation('classic', { frameParityMode: false, spawnLock: false }),
    ).toBe(true);
    expect(
      shouldRunFederatedSimulation('wasm-federated', { frameParityMode: false, spawnLock: false }),
    ).toBe(true);
    expect(
      shouldRunFederatedSimulation('classic', { frameParityMode: true, spawnLock: false }),
    ).toBe(false);
    expect(
      shouldRunFederatedSimulation('pathtrace', { frameParityMode: false, spawnLock: false }),
    ).toBe(false);
  });
});
