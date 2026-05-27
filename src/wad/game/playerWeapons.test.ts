import { describe, expect, it } from 'vitest';
import { createDefaultInventory } from './playerInventory';
import { cycleWeapon, selectWeaponBySlot, tryFireWeapon } from './playerWeapons';

describe('playerWeapons', () => {
  it('fires pistol and consumes ammo', () => {
    const inv = createDefaultInventory();
    const fireState = { lastFireAt: 0 };
    const result = tryFireWeapon(inv, 1000, fireState.lastFireAt);
    expect(result.fired).toBe(true);
    expect(result.sound).toBe('DSPISTOL');
    expect(inv.ammo.bullets).toBe(49);
  });

  it('selects owned weapon by slot key', () => {
    const inv = createDefaultInventory();
    inv.weapons.add('shotgun');
    expect(selectWeaponBySlot(inv, 2)).toBe(true);
    expect(inv.selectedWeapon).toBe('shotgun');
    expect(selectWeaponBySlot(inv, 7)).toBe(false);
  });

  it('cycles through owned weapons', () => {
    const inv = createDefaultInventory();
    inv.weapons.add('shotgun');
    cycleWeapon(inv, 1);
    expect(inv.selectedWeapon).toBe('shotgun');
    cycleWeapon(inv, -1);
    expect(inv.weapons.has(inv.selectedWeapon)).toBe(true);
  });
});
