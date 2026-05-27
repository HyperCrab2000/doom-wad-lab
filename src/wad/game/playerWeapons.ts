import type { AmmoState, PlayerInventory, WeaponSlot } from '@/wad/game/playerInventory';

export interface WeaponDef {
  ammoKind: keyof AmmoState | null;
  ammoPerShot: number;
  cooldownMs: number;
  sound: string;
  emptySound?: string;
}

export const WEAPON_DEFS: Record<WeaponSlot, WeaponDef> = {
  fist: { ammoKind: null, ammoPerShot: 0, cooldownMs: 350, sound: 'DSPUNCH' },
  chainsaw: { ammoKind: null, ammoPerShot: 0, cooldownMs: 120, sound: 'DSSAWFUL' },
  pistol: { ammoKind: 'bullets', ammoPerShot: 1, cooldownMs: 280, sound: 'DSPISTOL', emptySound: 'DSOOF' },
  shotgun: { ammoKind: 'shells', ammoPerShot: 1, cooldownMs: 550, sound: 'DSSHTGN', emptySound: 'DSOOF' },
  superShotgun: { ammoKind: 'shells', ammoPerShot: 2, cooldownMs: 650, sound: 'DSSHTGN', emptySound: 'DSOOF' },
  chaingun: { ammoKind: 'bullets', ammoPerShot: 1, cooldownMs: 140, sound: 'DSCHGUN', emptySound: 'DSOOF' },
  rocket: { ammoKind: 'rockets', ammoPerShot: 1, cooldownMs: 450, sound: 'DSRLAUNC', emptySound: 'DSOOF' },
  plasma: { ammoKind: 'cells', ammoPerShot: 1, cooldownMs: 120, sound: 'DSPLASMA', emptySound: 'DSOOF' },
  bfg: { ammoKind: 'cells', ammoPerShot: 40, cooldownMs: 1200, sound: 'DSBFG', emptySound: 'DSOOF' },
};

/** Weapon select keys 1–8 (Doom II slot 8 = super shotgun). */
export const WEAPON_SLOT_ORDER: WeaponSlot[] = [
  'fist',
  'pistol',
  'shotgun',
  'chaingun',
  'rocket',
  'plasma',
  'bfg',
  'superShotgun',
];

export interface FireWeaponResult {
  fired: boolean;
  sound: string | null;
  empty: boolean;
}

export function selectWeaponBySlot(inventory: PlayerInventory, slotIndex: number): boolean {
  const weapon = WEAPON_SLOT_ORDER[slotIndex];
  if (!weapon || !inventory.weapons.has(weapon)) return false;
  inventory.selectedWeapon = weapon;
  return true;
}

export function cycleWeapon(inventory: PlayerInventory, direction: 1 | -1): boolean {
  const owned = WEAPON_SLOT_ORDER.filter((w) => inventory.weapons.has(w));
  if (owned.length === 0) return false;
  const current = owned.indexOf(inventory.selectedWeapon);
  const next = (current + direction + owned.length) % owned.length;
  inventory.selectedWeapon = owned[next];
  return true;
}

export function tryFireWeapon(
  inventory: PlayerInventory,
  now: number,
  lastFireAt: number
): FireWeaponResult {
  if (inventory.health <= 0) {
    return { fired: false, sound: null, empty: false };
  }

  const def = WEAPON_DEFS[inventory.selectedWeapon];
  if (now - lastFireAt < def.cooldownMs) {
    return { fired: false, sound: null, empty: false };
  }

  if (def.ammoKind) {
    const ammo = inventory.ammo[def.ammoKind];
    if (ammo < def.ammoPerShot) {
      return { fired: false, sound: def.emptySound ?? 'DSOOF', empty: true };
    }
    inventory.ammo[def.ammoKind] = ammo - def.ammoPerShot;
  }

  return { fired: true, sound: def.sound, empty: false };
}
