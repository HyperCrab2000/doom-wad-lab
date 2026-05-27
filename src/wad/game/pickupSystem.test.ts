import { describe, expect, it } from 'vitest';
import { createDefaultInventory } from './playerInventory';
import { PickupTracker, tryPickups } from './pickupSystem';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { Thing } from '@/wad/interfaces/Thing';

describe('pickupSystem', () => {
  it('picks up a stimpack in range and marks thing picked', () => {
    const stim: Thing = {
      type: 2011,
      x: 32,
      y: 0,
      angle: 0,
      flags: {
        appearsOnEasy: true,
        appearsOnMedium: true,
        appearsOnHard: true,
        isDeaf: false,
        hideInSingleplayer: false,
        difficulty: 2,
      },
    };
    const map = {
      THINGS: [stim],
    } as unknown as WadMap;
    const inventory = createDefaultInventory();
    inventory.health = 80;
    const tracker = new PickupTracker();

    const result = tryPickups(map, 32, 0, 16, inventory, tracker);
    expect(result.message).toContain('stimpack');
    expect(inventory.health).toBe(90);
    expect(tracker.isPicked(stim)).toBe(true);
  });

  it('does not pick up out of range', () => {
    const stim: Thing = {
      type: 2011,
      x: 500,
      y: 0,
      angle: 0,
      flags: {
        appearsOnEasy: true,
        appearsOnMedium: true,
        appearsOnHard: true,
        isDeaf: false,
        hideInSingleplayer: false,
        difficulty: 2,
      },
    };
    const map = { THINGS: [stim] } as unknown as WadMap;
    const inventory = createDefaultInventory();
    const tracker = new PickupTracker();

    const result = tryPickups(map, 0, 0, 16, inventory, tracker);
    expect(result.message).toBeNull();
    expect(tracker.isPicked(stim)).toBe(false);
  });
});
