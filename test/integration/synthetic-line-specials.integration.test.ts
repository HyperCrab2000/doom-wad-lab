import { describe, expect, it } from 'vitest';
import { IMPLEMENTED_LINE_SPECIALS, LINE_SPECIAL_CATALOG } from '@/wad/game/lineSpecialRegistry';
import {
  createLineSpecialSimulator,
  simulateUseLine,
  simulateWalkLine,
} from '@/wad/game/lineSpecialSimulator';
import { getDoorSpecial } from '@/wad/game/lineSpecials';
import { getFloorMoverSpecial } from '@/wad/game/floorMoverSpecials';
import { getTeleportSpecial } from '@/wad/game/teleportSpecials';
import { getCrusherSpecial } from '@/wad/game/crusherSpecials';
import { getStairSpecial } from '@/wad/game/stairSpecials';
import { getDonutSpecial } from '@/wad/game/donutSpecials';
import { getLightSpecial } from '@/wad/game/lightSpecials';
import { getExitSpecial } from '@/wad/game/exitSpecials';
import {
  createDonutMap,
  createLightTagMap,
  createManualDoorMap,
  createStairPairMap,
  createTaggedActionMap,
  createTeleportMap,
  sector,
} from '../helpers/syntheticMaps';

/** CI-safe: no IWAD required. */
describe('line specials (synthetic, always-on)', () => {
  it('has a documented catalog for every stock special', () => {
    expect(Object.keys(LINE_SPECIAL_CATALOG).length).toBeGreaterThan(90);
    expect(IMPLEMENTED_LINE_SPECIALS.length).toBeGreaterThan(55);
  });

  it('exercises each implemented handler type at least once', () => {
    const door = IMPLEMENTED_LINE_SPECIALS.find((s) => getDoorSpecial(s))!;
    const floor = IMPLEMENTED_LINE_SPECIALS.find((s) => getFloorMoverSpecial(s))!;
    const teleport = IMPLEMENTED_LINE_SPECIALS.find((s) => getTeleportSpecial(s))!;

    expect(simulateUseLine(createLineSpecialSimulator(createManualDoorMap(door)), 0).triggered).toBe(
      getDoorSpecial(door)!.activation === 'switch'
    );

    const floorDef = getFloorMoverSpecial(floor)!;
    const floorMap = createTaggedActionMap(floor, 2, sector(0, 128, 2));
    const floorSim = createLineSpecialSimulator(floorMap);
    const floorResult =
      floorDef.activation === 'switch'
        ? simulateUseLine(floorSim, 0)
        : simulateWalkLine(floorSim, 0);
    expect(floorResult.triggered).toBe(true);

    expect(simulateWalkLine(createLineSpecialSimulator(createTeleportMap(teleport, 1)), 0).triggered).toBe(
      true
    );
  });

  it('marks scroll and transfer specials as implemented', () => {
    for (const special of [48, 22, 47, 53]) {
      expect(LINE_SPECIAL_CATALOG[special]?.status).toBe('implemented');
    }
  });

  it('marks stairs, donut, lights, and nhEF floors as implemented', () => {
    for (const special of [7, 8, 9, 12, 13, 17, 35, 18, 119]) {
      expect(LINE_SPECIAL_CATALOG[special]?.status).toBe('implemented');
    }
  });

  it('runs crusher, exit, stair, donut, and light handlers end-to-end', () => {
    const crusher = IMPLEMENTED_LINE_SPECIALS.find((s) => getCrusherSpecial(s)?.action === 'start')!;
    const crusherDef = getCrusherSpecial(crusher)!;
    const crushMap = createTaggedActionMap(crusher, 8, sector(0, 128, 8));
    const crushSim = createLineSpecialSimulator(crushMap);
    const crushResult =
      crusherDef.activation === 'switch'
        ? simulateUseLine(crushSim, 0)
        : simulateWalkLine(crushSim, 0);
    expect(crushResult.triggered).toBe(true);
    expect(crushSim.controller.crushers.getActiveCrusherCount()).toBe(1);

    const exit = IMPLEMENTED_LINE_SPECIALS.find((s) => getExitSpecial(s))!;
    const exitDef = getExitSpecial(exit)!;
    const exitSim = createLineSpecialSimulator(createTaggedActionMap(exit, 0, sector(0, 128, 0)));
    const exitResult =
      exitDef.activation === 'switch' ? simulateUseLine(exitSim, 0) : simulateWalkLine(exitSim, 0);
    expect(exitResult.requestExit).toBe(true);

    const stair = IMPLEMENTED_LINE_SPECIALS.find((s) => getStairSpecial(s))!;
    const stairDef = getStairSpecial(stair)!;
    const stairSim = createLineSpecialSimulator(createStairPairMap(stair));
    const stairResult =
      stairDef.activation === 'switch' ? simulateUseLine(stairSim, 0) : simulateWalkLine(stairSim, 0);
    expect(stairResult.triggered).toBe(true);

    const donutSim = createLineSpecialSimulator(createDonutMap(9, 3));
    expect(simulateUseLine(donutSim, 0).triggered).toBe(true);

    const light = IMPLEMENTED_LINE_SPECIALS.find((s) => getLightSpecial(s))!;
    const lightDef = getLightSpecial(light)!;
    const lightSim = createLineSpecialSimulator(createLightTagMap(light, 4, 50));
    const lightResult =
      lightDef.activation === 'switch' ? simulateUseLine(lightSim, 0) : simulateWalkLine(lightSim, 0);
    expect(lightResult.triggered).toBe(true);
  });
});
