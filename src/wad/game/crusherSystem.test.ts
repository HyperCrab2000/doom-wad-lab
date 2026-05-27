import { describe, expect, it } from 'vitest';
import { CrusherSystem } from './crusherSystem';
import { createTaggedActionMap, sector } from '../../../test/helpers/syntheticMaps';
import { createLineSpecialSimulator, simulateUseLine, simulateWalkLine } from './lineSpecialSimulator';

describe('CrusherSystem', () => {
  it('crushes a tagged sector on walk special 25', () => {
    const crush = sector(0, 128, 3);
    const map = createTaggedActionMap(25, 3, crush);
    const system = new CrusherSystem(map);

    expect(system.tryWalkLine(0, map.LINEDEFS[0]).triggered).toBe(true);
    expect(system.getActiveCrusherCount()).toBe(1);
    for (let i = 0; i < 20; i++) {
      system.tick(0.1);
    }
    expect(crush.ceilingheight - crush.floorheight).toBeLessThanOrEqual(10);
  });

  it('integrates with MapActionController', () => {
    const crush = sector(0, 128, 5);
    const map = createTaggedActionMap(6, 5, crush);
    const sim = createLineSpecialSimulator(map);
    expect(simulateUseLine(sim, 0).triggered).toBe(true);
    expect(sim.controller.crushers.getActiveCrusherCount()).toBe(1);
    for (let i = 0; i < 12; i++) {
      sim.controller.tick(0.1);
    }
    expect(crush.ceilingheight - crush.floorheight).toBeLessThan(128);
  });

  it('opens after the crush wait phase', () => {
    const crush = sector(0, 64, 2);
    const map = createTaggedActionMap(6, 2, crush);
    const system = new CrusherSystem(map);
    system.tryUseLine(0, map.LINEDEFS[0]);
    for (let i = 0; i < 12; i++) {
      system.tick(0.1);
    }
    expect(crush.ceilingheight - crush.floorheight).toBeLessThanOrEqual(10);
    for (let i = 0; i < 30; i++) {
      system.tick(0.1);
    }
    expect(crush.ceilingheight - crush.floorheight).toBeGreaterThan(10);
    expect(system.getActiveCrusherCount()).toBe(0);
  });

  it('does not start a second crusher on the same sector', () => {
    const crush = sector(0, 128, 7);
    const map = createTaggedActionMap(6, 7, crush);
    const system = new CrusherSystem(map);
    expect(system.tryUseLine(0, map.LINEDEFS[0]).triggered).toBe(true);
    expect(system.tryUseLine(0, map.LINEDEFS[0]).triggered).toBe(false);
    expect(system.getActiveCrusherCount()).toBe(1);
  });

  it('stops crushers by tag on special 57', () => {
    const crush = sector(0, 128, 9);
    const map = createTaggedActionMap(6, 9, crush);
    const system = new CrusherSystem(map);
    system.tryUseLine(0, map.LINEDEFS[0]);
    map.LINEDEFS[0].special = 57;
    expect(system.tryWalkLine(0, map.LINEDEFS[0]).triggered).toBe(true);
    expect(system.getActiveCrusherCount()).toBe(0);
  });
});
