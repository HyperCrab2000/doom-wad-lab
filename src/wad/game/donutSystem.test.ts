import { describe, expect, it } from 'vitest';
import { createLineSpecialSimulator, simulateUseLine } from './lineSpecialSimulator';
import { createDonutMap } from '../../../test/helpers/syntheticMaps';

describe('DonutSystem', () => {
  it('raises pillar and lowers outer ring on special 9', () => {
    const map = createDonutMap(9, 4);
    const pillar = map.SECTORS[1];
    const outer = map.SECTORS[0];
    const sim = createLineSpecialSimulator(map);
    expect(simulateUseLine(sim, 0).triggered).toBe(true);
    for (let i = 0; i < 40; i++) {
      sim.controller.tick(0.1);
    }
    expect(pillar.floorheight).toBeGreaterThan(outer.floorheight);
    expect(sim.controller.floors.getActiveMoverCount()).toBeGreaterThanOrEqual(0);
  });

  it('does not trigger without a valid tag or ring', () => {
    const map = createDonutMap(9, 0);
    const sim = createLineSpecialSimulator(map);
    expect(simulateUseLine(sim, 0).triggered).toBe(false);
  });
});
