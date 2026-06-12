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
    return picked(label);
  };
}

function armorPickup(points: number, type: 'green' | 'blue', label: string): PickupHandler {
  return (inventory, _ctx) => {
    const cap = type === 'blue' ? ARMOR_CAP_BLUE : ARMOR_CAP_GREEN;
    if (inventory.armor >= cap && inventory.armorType === type) return NO_PICK;
    setArmor(inventory, points, type);
    return picked(label);
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
    return picked(label);
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
      if (isNew) return picked(label, 'weapon');
      if (gained > 0) return picked(ammo.ammoLabel);
      return NO_PICK;
    }
    if (isNew) return picked(label, 'weapon');
    return NO_PICK;
  };
}

/** Vanilla thing type id → pickup handler (strings from d_englsh.h / p_inter.c). */
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
    return picked('Picked up a backpack full of ammo!');
  },
  17: ammoPickup('cells', 100, 'Picked up an energy cell pack.'),
  82: weaponPickup('superShotgun', 'You got the super shotgun!', {
    kind: 'shells',
    amount: 8,
    ammoLabel: 'Picked up 4 shotgun shells.',
  }),
  83: (inv, _ctx) => {
    inv.health = HEALTH_CAP_SUPER;
    setArmor(inv, ARMOR_CAP_BLUE, 'blue');
    return picked('Picked up a MegaSphere!');
  },
  2001: weaponPickup('shotgun', 'You got the shotgun!', {
    kind: 'shells',
    amount: 8,
    ammoLabel: 'Picked up 4 shotgun shells.',
  }),
  2002: weaponPickup('chaingun', 'You got the chaingun!', {
    kind: 'bullets',
    amount: 20,
    ammoLabel: 'Picked up a clip.',
  }),
  2003: weaponPickup('rocket', 'You got the rocket launcher!', {
    kind: 'rockets',
    amount: 2,
    ammoLabel: 'Picked up a rocket.',
  }),
  2004: weaponPickup('plasma', 'You got the plasma gun!', {
    kind: 'cells',
    amount: 40,
    ammoLabel: 'Picked up an energy cell.',
  }),
  2005: weaponPickup('chainsaw', 'A chainsaw!  Find some meat!'),
  2006: weaponPickup('bfg', 'You got the BFG9000!  Oh, yes.', {
    kind: 'cells',
    amount: 40,
    ammoLabel: 'Picked up an energy cell.',
  }),
  2007: ammoPickup('bullets', 10, 'Picked up a clip.'),
  2008: ammoPickup('shells', 4, 'Picked up 4 shotgun shells.'),
  2010: ammoPickup('rockets', 1, 'Picked up a rocket.'),
  2011: healthPickup(10, 'Picked up a stimpack.'),
  2012: (inv, _ctx) => {
    const gained = addHealth(inv, 25);
    if (gained <= 0) return NO_PICK;
    if (inv.health < 25) {
      return picked('Picked up a medikit that you REALLY need!');
    }
    return picked('Picked up a medikit.');
  },
  2013: healthPickup(100, 'Picked up a soul sphere.', { allowOver100: true, maxCap: HEALTH_CAP_SUPER }),
  2014: healthPickup(1, 'Picked up a health bonus.', { allowOver100: true, maxCap: HEALTH_CAP_SUPER }),
  2015: (inv, _ctx) => {
    if (inv.armor >= getArmorCap(inv)) return NO_PICK;
    addArmorBonus(inv, 2);
    return picked('Picked up an armor bonus.');
  },
  2018: armorPickup(ARMOR_CAP_GREEN, 'green', 'Picked up the armor.'),
  2019: armorPickup(ARMOR_CAP_BLUE, 'blue', 'Picked up the MegaArmor!'),
  2022: powerupPickup('invuln', 'Invulnerability!'),
  2023: powerupPickup('berserk', 'Berserk!'),
  2024: powerupPickup('invis', 'Partial invisibility.'),
  2025: powerupPickup('radSuit', 'Radiation shielding suit.'),
  2026: powerupPickup('computerMap', 'Computer area map.'),
  2045: powerupPickup('lightAmp', 'Light amplification visor.'),
  2046: ammoPickup('rockets', 5, 'Picked up a box of rockets.'),
  2047: ammoPickup('cells', 20, 'Picked up an energy cell.'),
  2048: ammoPickup('bullets', 50, 'Picked up a box of bullets.'),
  2049: ammoPickup('shells', 20, 'Picked up a box of shotgun shells.'),
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
