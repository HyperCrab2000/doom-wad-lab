import { describe, expect, it } from 'vitest';
import {
  addAmmo,
  addHealth,
  applySectorEffects,
  createDefaultInventory,
  getMaxAmmo,
  inventoryHudSnapshot,
  setArmor,
} from './playerInventory';
import { createDefaultPowerups } from './playerPowerups';
import { getSectorPlayerEffects } from './sectorSpecialRuntime';
import { applyPickupForThingType } from './pickupDefinitions';

describe('playerInventory', () => {
  it('starts with pistol and partial bullets', () => {
    const inv = createDefaultInventory();
    expect(inv.weapons.has('pistol')).toBe(true);
    expect(inv.ammo.bullets).toBe(50);
  });

  it('caps stimpack at 100 health', () => {
    const inv = createDefaultInventory();
    inv.health = 95;
    applyPickupForThingType(2011, inv);
    expect(inv.health).toBe(100);
    const again = applyPickupForThingType(2011, inv);
    expect(again.picked).toBe(false);
  });

  it('allows soul sphere over 100', () => {
    const inv = createDefaultInventory();
    applyPickupForThingType(2013, inv);
    expect(inv.health).toBe(200);
  });

  it('doubles max ammo with backpack', () => {
    const inv = createDefaultInventory();
    inv.backpack = true;
    expect(getMaxAmmo(inv).bullets).toBe(400);
  });

  it('applies sector damage over time', () => {
    const inv = createDefaultInventory();
    const sector = { type: 4 } as { type: number };
    const fx = getSectorPlayerEffects(sector);
    applySectorEffects(inv, fx, 1);
    expect(inv.health).toBeLessThan(100);
  });

  it('sets blue armor to 200 percent cap', () => {
    const inv = createDefaultInventory();
    setArmor(inv, 200, 'blue');
    expect(inv.armor).toBe(200);
    const gained = addAmmo(inv, 'bullets', 500);
    expect(gained).toBeGreaterThan(0);
    expect(inv.ammo.bullets).toBe(200);
  });

  it('respects invulnerability for sector damage', () => {
    const inv = createDefaultInventory();
    const powerups = createDefaultPowerups();
    powerups.invulnUntil = performance.now() + 60_000;
    const sector = { type: 4 } as { type: number };
    const fx = getSectorPlayerEffects(sector);
    applySectorEffects(inv, fx, 1, powerups);
    expect(inv.health).toBe(100);
  });

  it('exports HUD snapshot', () => {
    const snap = inventoryHudSnapshot(createDefaultInventory());
    expect(snap.weapon).toBe('pistol');
    expect(snap.alive).toBe(true);
  });

  it('returns no pickup for unknown thing types', () => {
    expect(applyPickupForThingType(99999, createDefaultInventory()).picked).toBe(false);
  });

  it('heals from sector type 196', () => {
    const inv = createDefaultInventory();
    inv.health = 50;
    const sector = { type: 196 } as { type: number };
    const fx = getSectorPlayerEffects(sector);
    applySectorEffects(inv, fx, 2);
    expect(inv.health).toBeGreaterThan(50);
  });
});
