import { describe, expect, it } from 'vitest';
import { createLineSpecialSimulator, simulateWalkLine } from './lineSpecialSimulator';
import { createStairPairMap } from '../../../test/helpers/syntheticMaps';

describe('StairSystem', () => {
  it('raises a chain of sectors on walk special 8', () => {
    const map = createStairPairMap(8);
    const sim = createLineSpecialSimulator(map);
    const result = simulateWalkLine(sim, 0);
    expect(result.triggered).toBe(true);
    expect(sim.controller.floors.getActiveMoverCount()).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) {
      sim.controller.tick(0.1);
    }
    expect(map.SECTORS[1].floorheight).toBeGreaterThan(0);
  });

  it('starts crushers on turbo stair special 100', () => {
    const map = createStairPairMap(100);
    const sim = createLineSpecialSimulator(map);
    simulateWalkLine(sim, 0);
    expect(sim.controller.crushers.getActiveCrusherCount()).toBeGreaterThan(0);
  });
});
