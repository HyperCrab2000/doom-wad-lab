import type { PickupResult, PlayerInventory } from '@/wad/game/playerInventory';
import { grantPowerup, type PlayerPowerups, type PowerupKind } from '@/wad/game/playerPowerups';
import {
  addAmmo,
  addArmorBonus,
  addHealth,
  getArmorCap,
  grantWeapon,
  setArmor,
  HEALTH_CAP_SUPER,
  ARMOR_CAP_BLUE,
  ARMOR_CAP_GREEN,
} from '@/wad/game/playerInventory';

export interface PickupContext {
  powerups?: PlayerPowerups;
}

type PickupHandler = (inventory: PlayerInventory, ctx: PickupContext) => PickupResult;

function powerupPickup(kind: PowerupKind, message: string): PickupHandler {
  return (_inventory, ctx) => {
    if (ctx.powerups) grantPowerup(ctx.powerups, kind);
    return picked(message);
  };
}

const NO_PICK: PickupResult = { picked: false, message: null, sfx: null };

function picked(message: string, sfx: PickupResult['sfx'] = 'item'): PickupResult {
  return { picked: true, message, sfx };
}

function healthPickup(
  amount: number,
  label: string,
  options: { allowOver100?: boolean; maxCap?: number } = {}
): PickupHandler {
  return (inventory, _ctx) => {
    const gained = addHealth(inventory, amount, options);
    if (gained <= 0) return NO_PICK;
    return picked(`Picked up ${label}.`);
  };
}

function armorPickup(points: number, type: 'green' | 'blue', label: string): PickupHandler {
  return (inventory, _ctx) => {
    const cap = type === 'blue' ? ARMOR_CAP_BLUE : ARMOR_CAP_GREEN;
    if (inventory.armor >= cap && inventory.armorType === type) return NO_PICK;
    setArmor(inventory, points, type);
    return picked(`Picked up ${label}.`);
  };
}

function ammoPickup(
  kind: keyof PlayerInventory['ammo'],
  amount: number,
  label: string
): PickupHandler {
  return (inventory, _ctx) => {
    const gained = addAmmo(inventory, kind, amount);
    if (gained <= 0) return NO_PICK;
    return picked(`Picked up ${label}.`);
  };
}

function weaponPickup(
  weapon: Parameters<typeof grantWeapon>[1],
  label: string,
  ammo?: { kind: keyof PlayerInventory['ammo']; amount: number; ammoLabel: string }
): PickupHandler {
  return (inventory, _ctx) => {
    const isNew = grantWeapon(inventory, weapon);
    if (ammo) {
      const gained = addAmmo(inventory, ammo.kind, ammo.amount);
      if (isNew) return picked(`Picked up a ${label}.`, 'weapon');
      if (gained > 0) return picked(`Picked up ${ammo.ammoLabel}.`);
      return NO_PICK;
    }
    if (isNew) return picked(`Picked up a ${label}.`, 'weapon');
    return NO_PICK;
  };
}

/** Vanilla thing type id → pickup handler. */
export const PICKUP_BY_THING_TYPE: Record<number, PickupHandler> = {
  5: (inv, _ctx) => {
    if (inv.keys.blue) return NO_PICK;
    inv.keys.blue = true;
    return picked('Picked up a blue keycard.');
  },
  6: (inv, _ctx) => {
    if (inv.keys.yellow) return NO_PICK;
    inv.keys.yellow = true;
    return picked('Picked up a yellow keycard.');
  },
  13: (inv, _ctx) => {
    if (inv.keys.red) return NO_PICK;
    inv.keys.red = true;
    return picked('Picked up a red keycard.');
  },
  8: (inv, _ctx) => {
    if (inv.backpack) return NO_PICK;
    inv.backpack = true;
    return picked('Picked up a backpack.');
  },
  17: ammoPickup('cells', 100, 'cell charge pack'),
  82: weaponPickup('superShotgun', 'super shotgun', {
    kind: 'shells',
    amount: 8,
    ammoLabel: 'shotgun shells',
  }),
  83: (inv, _ctx) => {
    inv.health = HEALTH_CAP_SUPER;
    setArmor(inv, ARMOR_CAP_BLUE, 'blue');
    return picked('Picked up a megasphere!');
  },
  2001: weaponPickup('shotgun', 'shotgun', {
    kind: 'shells',
    amount: 8,
    ammoLabel: 'shotgun shells',
  }),
  2002: weaponPickup('chaingun', 'chaingun', {
    kind: 'bullets',
    amount: 20,
    ammoLabel: 'ammo',
  }),
  2003: weaponPickup('rocket', 'rocket launcher', {
    kind: 'rockets',
    amount: 2,
    ammoLabel: 'rockets',
  }),
  2004: weaponPickup('plasma', 'plasma gun', {
    kind: 'cells',
    amount: 40,
    ammoLabel: 'cell charge',
  }),
  2005: weaponPickup('chainsaw', 'chainsaw'),
  2006: weaponPickup('bfg', 'BFG9000', {
    kind: 'cells',
    amount: 40,
    ammoLabel: 'cell charge',
  }),
  2007: ammoPickup('bullets', 10, 'a clip'),
  2008: ammoPickup('shells', 4, '4 shotgun shells'),
  2010: ammoPickup('rockets', 1, 'a rocket'),
  2011: healthPickup(10, 'a stimpack'),
  2012: healthPickup(25, 'a medikit'),
  2013: healthPickup(100, 'a soul sphere', { allowOver100: true, maxCap: HEALTH_CAP_SUPER }),
  2014: healthPickup(1, 'a health bonus', { allowOver100: true, maxCap: HEALTH_CAP_SUPER }),
  2015: (inv, _ctx) => {
    const gained = addArmorBonus(inv, 2);
    if (gained <= 0 && inv.armor >= getArmorCap(inv)) return NO_PICK;
    addArmorBonus(inv, 2);
    return picked('Picked up an armor bonus.');
  },
  2018: armorPickup(ARMOR_CAP_GREEN, 'green', 'armor'),
  2019: armorPickup(ARMOR_CAP_BLUE, 'blue', 'megaarmor'),
  2022: powerupPickup('invuln', 'Invulnerability!'),
  2023: powerupPickup('berserk', 'Berserk!'),
  2024: powerupPickup('invis', 'Partial invisibility.'),
  2025: powerupPickup('radSuit', 'Radiation shielding suit.'),
  2026: powerupPickup('computerMap', 'Computer area map.'),
  2045: powerupPickup('lightAmp', 'Light amplification visor.'),
  2046: ammoPickup('rockets', 5, 'a box of rockets'),
  2047: ammoPickup('cells', 20, 'an energy cell'),
  2048: ammoPickup('bullets', 50, 'a box of bullets'),
  2049: ammoPickup('shells', 20, 'a box of shotgun shells'),
};

export function applyPickupForThingType(
  thingTypeId: number,
  inventory: PlayerInventory,
  ctx: PickupContext = {}
): PickupResult {
  const handler = PICKUP_BY_THING_TYPE[thingTypeId];
  if (!handler) return NO_PICK;
  return handler(inventory, ctx);
}
