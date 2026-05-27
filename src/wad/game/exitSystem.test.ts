import { describe, expect, it } from 'vitest';
import { createTaggedActionMap, sector } from '../../../test/helpers/syntheticMaps';
import { createLineSpecialSimulator, simulateUseLine, simulateWalkLine } from './lineSpecialSimulator';

describe('ExitSystem', () => {
  it.each([11, 51, 52, 124] as const)('requests exit on special %i', (special) => {
    const map = createTaggedActionMap(special, 0, sector(0, 128, 0));
    const sim = createLineSpecialSimulator(map);
    const result =
      special === 11 ? simulateUseLine(sim, 0) : simulateWalkLine(sim, 0);
    expect(result.triggered).toBe(true);
    expect(result.requestExit).toBe(true);
    expect(sim.controller.isExitRequested()).toBe(true);
  });

  it('clears exit request and ignores repeat-once lines', () => {
    const map = createTaggedActionMap(11, 0, sector(0, 128, 0));
    const sim = createLineSpecialSimulator(map);
    simulateUseLine(sim, 0);
    expect(sim.controller.isExitRequested()).toBe(true);
    sim.controller.exits.clearExitRequest();
    expect(sim.controller.isExitRequested()).toBe(false);
    expect(simulateUseLine(sim, 0).triggered).toBe(false);
  });
});
