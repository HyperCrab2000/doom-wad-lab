import { describe, expect, it } from 'vitest';
import {
  createLineSpecialSimulator,
  simulateUseLine,
  simulateWalkLine,
} from './lineSpecialSimulator';
import { createLightTagMap } from '../../../test/helpers/syntheticMaps';

describe('LightSystem', () => {
  it('sets tagged sector light to 255 on special 13', () => {
    const map = createLightTagMap(13, 2, 40);
    const target = map.SECTORS.find((s) => s.tag === 2)!;
    const sim = createLineSpecialSimulator(map);
    expect(simulateWalkLine(sim, 0).triggered).toBe(true);
    expect(target.lightlevel).toBe(255);
  });

  it('sets flicker sector type on special 17', () => {
    const map = createLightTagMap(17, 3, 100);
    const target = map.SECTORS.find((s) => s.tag === 3)!;
    const sim = createLineSpecialSimulator(map);
    simulateWalkLine(sim, 0);
    expect(target.type).toBe(17);
  });

  it('raises light to brightest neighbor on special 12', () => {
    const map = createLightTagMap(12, 5, 30);
    const target = map.SECTORS.find((s) => s.tag === 5)!;
    const sim = createLineSpecialSimulator(map);
    simulateWalkLine(sim, 0);
    expect(target.lightlevel).toBe(200);
    expect(sim.controller.lights.isDirty()).toBe(true);
    sim.controller.lights.clearDirty();
    expect(sim.controller.lights.isDirty()).toBe(false);
  });

  it('sets light to lowest neighbor on special 104', () => {
    const map = createLightTagMap(104, 6, 200);
    const target = map.SECTORS.find((s) => s.tag === 6)!;
    const sim = createLineSpecialSimulator(map);
    simulateWalkLine(sim, 0);
    expect(target.lightlevel).toBeLessThanOrEqual(200);
  });

  it('sets 255 on switch special 138', () => {
    const map = createLightTagMap(138, 7, 50);
    const target = map.SECTORS.find((s) => s.tag === 7)!;
    const sim = createLineSpecialSimulator(map);
    expect(simulateUseLine(sim, 0).triggered).toBe(true);
    expect(target.lightlevel).toBe(255);
  });
});
