import { describe, expect, it } from 'vitest';
import { createTaggedActionMap, sector } from '../../../test/helpers/syntheticMaps';
import { createLineSpecialSimulator, simulateWalkLine } from './lineSpecialSimulator';

describe('MovingFloorSystem', () => {
  it('starts perpetual motion on special 53', () => {
    const target = sector(0, 128, 4);
    const map = createTaggedActionMap(53, 4, target);
    const sim = createLineSpecialSimulator(map);
    expect(simulateWalkLine(sim, 0).triggered).toBe(true);
    expect(sim.controller.movingFloors.getActiveCount()).toBe(1);
    for (let i = 0; i < 30; i++) {
      sim.controller.tick(0.1);
    }
    expect(sim.controller.movingFloors.getActiveCount()).toBe(1);
    expect(sim.controller.isDirty()).toBe(true);
    for (let i = 0; i < 40; i++) {
      sim.controller.tick(0.1);
    }
    expect(target.floorheight).not.toBe(0);
  });

  it('stops tagged movers on special 54', () => {
    const target = sector(0, 128, 5);
    const map = createTaggedActionMap(53, 5, target);
    const sim = createLineSpecialSimulator(map);
    simulateWalkLine(sim, 0);
    map.LINEDEFS[0].special = 54;
    expect(simulateWalkLine(sim, 0).triggered).toBe(true);
    expect(sim.controller.movingFloors.getActiveCount()).toBe(0);
  });
});
