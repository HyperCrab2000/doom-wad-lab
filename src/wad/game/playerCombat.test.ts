import { describe, expect, it } from 'vitest';
import { createDefaultInventory } from './playerInventory';
import { handlePlayerFire } from './playerCombat';
import { MapActionController } from './mapActionController';
import type { WadMap } from '@/wad/interfaces/WadMap';

const emptyMap = {
  LINEDEFS: [],
  VERTEXES: [],
  SIDEDEFS: [],
  SECTORS: [],
} as unknown as WadMap;

describe('playerCombat', () => {
  it('fires pistol and consumes ammo', () => {
    const inventory = createDefaultInventory();
    const fireState = { lastFireAt: 0 };
    const mapActions = new MapActionController(emptyMap);
    const { sound } = handlePlayerFire({
      map: emptyMap,
      mapActions,
      inventory,
      fireState,
      x: 0,
      y: 0,
      yaw: 0,
    });
    expect(sound).toBe('DSPISTOL');
    expect(inventory.ammo.bullets).toBe(49);
    expect(fireState.lastFireAt).toBeGreaterThan(0);
  });
});
