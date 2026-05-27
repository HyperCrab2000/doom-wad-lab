import { describe, expect, it } from 'vitest';
import { DOOR_SPECIALS } from './lineSpecials';
import { FLOOR_MOVER_SPECIALS } from './floorMoverSpecials';
import { TELEPORT_SPECIALS } from './teleportSpecials';
import { CRUSHER_SPECIALS } from './crusherSpecials';
import { EXIT_SPECIALS } from './exitSpecials';
import { STAIR_SPECIALS } from './stairSpecials';
import { DONUT_SPECIALS } from './donutSpecials';
import { LIGHT_SPECIALS } from './lightSpecials';
import { MOVING_FLOOR_SPECIALS } from './movingFloorSpecials';
import { IMPLEMENTED_LINE_SPECIALS } from './lineSpecialRegistry';
import {
  createLineSpecialSimulator,
  simulateUseLine,
  simulateWalkLine,
} from './lineSpecialSimulator';
import {
  createDonutMap,
  createLightTagMap,
  createManualDoorMap,
  createNhEFPairMap,
  createTransferTaggedMap,
  createStairPairMap,
  createSwitchMap,
  createTaggedActionMap,
  createTeleportMap,
  sector,
} from '../../../test/helpers/syntheticMaps';

describe('implemented line specials (synthetic maps)', () => {
  it('catalog matches handler tables', () => {
    const fromTables = new Set([
      ...Object.keys(DOOR_SPECIALS).map(Number),
      ...Object.keys(FLOOR_MOVER_SPECIALS).map(Number),
      ...Object.keys(TELEPORT_SPECIALS).map(Number),
      ...Object.keys(CRUSHER_SPECIALS).map(Number),
      ...Object.keys(EXIT_SPECIALS).map(Number),
      ...Object.keys(STAIR_SPECIALS).map(Number),
      ...Object.keys(DONUT_SPECIALS).map(Number),
      ...Object.keys(LIGHT_SPECIALS).map(Number),
      ...Object.keys(MOVING_FLOOR_SPECIALS).map(Number),
      48,
    ]);
    for (const special of IMPLEMENTED_LINE_SPECIALS) {
      expect(fromTables.has(special), `special ${special} missing handler`).toBe(true);
    }
  });

  describe.each(
    Object.entries(DOOR_SPECIALS).map(([n, def]) => ({
      special: Number(n),
      def,
    }))
  )('door special $special', ({ special, def }) => {
    it(`triggers via ${def.activation}`, () => {
      const map = def.remote
        ? createTaggedActionMap(special, 7, sector(0, 8, 7))
        : createManualDoorMap(special);
      const sim = createLineSpecialSimulator(map);
      const result =
        def.activation === 'walk' ? simulateWalkLine(sim, 0) : simulateUseLine(sim, 0);
      expect(result.triggered).toBe(true);
      expect(sim.controller.getActiveMoverCount()).toBeGreaterThan(0);
    });
  });

  describe.each(
    Object.entries(FLOOR_MOVER_SPECIALS).map(([n, def]) => ({
      special: Number(n),
      def,
    }))
  )('floor mover special $special', ({ special, def }) => {
    it(`triggers tagged sector via ${def.activation}`, () => {
      const needsRaisedFloor =
        def.kind === 'floorDown' || def.kind === 'floorDownHEF' || def.kind === 'floorDownHEF8';
      const target = sector(needsRaisedFloor ? 32 : 0, 128, 9);
      const map = def.tagFromSector
        ? createTransferTaggedMap(special, 9)
        : def.kind === 'floorUpNhEF' ||
            def.kind === 'floorDownHEF' ||
            def.kind === 'floorDownHEF8'
          ? createNhEFPairMap(special, 9)
          : createTaggedActionMap(special, 9, target);
      const sim = createLineSpecialSimulator(map);
      const result =
        def.activation === 'walk'
          ? simulateWalkLine(sim, 0)
          : simulateUseLine(sim, 0);
      expect(result.triggered).toBe(true);
      expect(sim.controller.floors.getActiveMoverCount()).toBeGreaterThan(0);
      const floorSubject =
        def.tagFromSector === true
          ? map.SECTORS.find((s) => s.tag === 9 && s.floorheight > 0) ?? map.SECTORS[1]
          : target;
      sim.controller.floors.tick(0.5);
      if (def.kind === 'floorUp') {
        expect(floorSubject.floorheight).toBeGreaterThan(0);
      } else if (def.kind === 'floorDown') {
        sim.controller.floors.tick(2);
        expect(floorSubject.floorheight).toBeLessThanOrEqual(0);
      } else if (def.kind === 'ceilingDown') {
        sim.controller.floors.tick(2);
        expect(target.ceilingheight).toBeLessThan(128);
      }
    });
  });

  describe.each([39, 97] as const)('teleport special %i', (special) => {
    it('walk triggers teleport to tagged landing', () => {
      const map = createTeleportMap(special, 3);
      const sim = createLineSpecialSimulator(map);
      const result = simulateWalkLine(sim, 0);
      expect(result.triggered).toBe(true);
      expect(result.teleport).toBeDefined();
      expect(result.teleport!.sectorIndex).toBe(1);
    });
  });

  describe.each(
    Object.entries(CRUSHER_SPECIALS).map(([n, def]) => ({
      special: Number(n),
      def,
    }))
  )('crusher special $special', ({ special, def }) => {
    it(`triggers via ${def.activation} (${def.action})`, () => {
      const crush = sector(0, 128, 5);
      const map = createTaggedActionMap(def.action === 'stop' ? 6 : special, 5, crush);
      const sim = createLineSpecialSimulator(map);
      if (def.action === 'stop') {
        expect(simulateUseLine(sim, 0).triggered).toBe(true);
        expect(sim.controller.crushers.getActiveCrusherCount()).toBe(1);
        map.LINEDEFS[0].special = special;
      }
      const result =
        def.activation === 'switch' ? simulateUseLine(sim, 0) : simulateWalkLine(sim, 0);
      expect(result.triggered).toBe(true);
      if (def.action === 'start') {
        expect(sim.controller.crushers.getActiveCrusherCount()).toBeGreaterThan(0);
      } else {
        expect(sim.controller.crushers.getActiveCrusherCount()).toBe(0);
      }
    });
  });

  describe.each(
    Object.entries(EXIT_SPECIALS).map(([n, def]) => ({
      special: Number(n),
      def,
    }))
  )('exit special $special', ({ special, def }) => {
    it(`requests exit via ${def.activation}`, () => {
      const map = createTaggedActionMap(special, 0, sector(0, 128, 0));
      const sim = createLineSpecialSimulator(map);
      const result =
        def.activation === 'switch' ? simulateUseLine(sim, 0) : simulateWalkLine(sim, 0);
      expect(result.triggered).toBe(true);
      expect(result.requestExit).toBe(true);
      expect(sim.controller.isExitRequested()).toBe(true);
    });
  });

  describe.each(
    Object.entries(STAIR_SPECIALS).map(([n, def]) => ({
      special: Number(n),
      def,
    }))
  )('stair special $special', ({ special, def }) => {
    it(`starts stair chain via ${def.activation}`, () => {
      const map = createStairPairMap(special);
      const sim = createLineSpecialSimulator(map);
      const result =
        def.activation === 'switch' ? simulateUseLine(sim, 0) : simulateWalkLine(sim, 0);
      expect(result.triggered).toBe(true);
      expect(sim.controller.floors.getActiveMoverCount()).toBeGreaterThan(0);
    });
  });

  describe.each(
    Object.entries(DONUT_SPECIALS).map(([n, def]) => ({
      special: Number(n),
      def,
    }))
  )('donut special $special', ({ special }) => {
    it('raises pillar and lowers outer ring', () => {
      const map = createDonutMap(special, 4);
      const pillar = map.SECTORS[1];
      const outer = map.SECTORS[0];
      const sim = createLineSpecialSimulator(map);
      expect(simulateUseLine(sim, 0).triggered).toBe(true);
      for (let i = 0; i < 40; i++) {
        sim.controller.tick(0.1);
      }
      expect(pillar.floorheight).toBeGreaterThan(outer.floorheight);
    });
  });

  describe.each(
    Object.entries(LIGHT_SPECIALS).map(([n, def]) => ({
      special: Number(n),
      def,
    }))
  )('light special $special', ({ special, def }) => {
    it(`applies ${def.effect} via ${def.activation}`, () => {
      const map = createLightTagMap(special, 2, 40);
      const target = map.SECTORS.find((s) => s.tag === 2)!;
      const sim = createLineSpecialSimulator(map);
      const result =
        def.activation === 'switch' ? simulateUseLine(sim, 0) : simulateWalkLine(sim, 0);
      expect(result.triggered).toBe(true);
      if (def.effect === 'zero') {
        expect(target.lightlevel).toBe(0);
      } else if (def.effect === 'max255') {
        expect(target.lightlevel).toBe(255);
      } else if (def.effect === 'flicker') {
        expect(target.type).toBe(17);
      } else if (def.effect === 'maxNeighbor') {
        expect(target.lightlevel).toBeGreaterThanOrEqual(200);
      }
      expect(sim.controller.lights.isDirty()).toBe(true);
    });
  });

  it('flips switch textures on switch-activated movers', () => {
    const target = sector(0, 128, 4);
    const map = createSwitchMap(21, 4, target);
    const sim = createLineSpecialSimulator(map);
    expect(simulateUseLine(sim, 0).triggered).toBe(true);
    expect(sim.controller.getSwitchedLineIndices().has(0)).toBe(true);
    expect(map.SIDEDEFS[0].middleTexture).toMatch(/^SW2/);
  });

  describe.each(
    Object.entries(MOVING_FLOOR_SPECIALS).map(([n, def]) => ({
      special: Number(n),
      def,
    }))
  )('moving floor special $special', ({ special, def }) => {
    it(`triggers via ${def.activation} (${def.action})`, () => {
      const target = sector(0, 128, 6);
      const map = createTaggedActionMap(def.action === 'stop' ? 53 : special, 6, target);
      const sim = createLineSpecialSimulator(map);
      if (def.action === 'stop') {
        expect(simulateWalkLine(sim, 0).triggered).toBe(true);
        map.LINEDEFS[0].special = special;
      }
      const result = simulateWalkLine(sim, 0);
      expect(result.triggered).toBe(true);
      if (def.action === 'start') {
        expect(sim.controller.movingFloors.getActiveCount()).toBeGreaterThan(0);
      }
    });
  });
});
