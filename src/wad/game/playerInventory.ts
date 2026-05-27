import type { PlayerKeyState } from '@/wad/game/doorKeys';
import type { PlayerPowerups } from '@/wad/game/playerPowerups';
import { shouldBlockSectorDamage } from '@/wad/game/playerPowerups';
import type { SectorPlayerEffects } from '@/wad/game/sectorSpecialRuntime';

/** Standard medikit / stimpack cap (percent). */
export const HEALTH_CAP_NORMAL = 100;
/** Soul sphere and megasphere health ceiling. */
export const HEALTH_CAP_SUPER = 200;
/** Green armor display cap. */
export const ARMOR_CAP_GREEN = 100;
/** Blue armor display cap (200% in status bar). */
export const ARMOR_CAP_BLUE = 200;

export type WeaponSlot =
  | 'fist'
  | 'pistol'
  | 'chainsaw'
  | 'shotgun'
  | 'chaingun'
  | 'rocket'
  | 'plasma'
  | 'bfg'
  | 'superShotgun';

export interface AmmoState {
  bullets: number;
  shells: number;
  rockets: number;
  cells: number;
}

export interface PlayerInventory {
  health: number;
  armor: number;
  armorType: 'none' | 'green' | 'blue';
  weapons: Set<WeaponSlot>;
  selectedWeapon: WeaponSlot;
  ammo: AmmoState;
  keys: PlayerKeyState;
  backpack: boolean;
}

export interface PickupResult {
  picked: boolean;
  message: string | null;
  sfx: 'item' | 'weapon' | null;
}

export function createDefaultInventory(): PlayerInventory {
  return {
    health: 100,
    armor: 0,
    armorType: 'none',
    weapons: new Set<WeaponSlot>(['fist', 'pistol']),
    selectedWeapon: 'pistol',
    ammo: { bullets: 50, shells: 0, rockets: 0, cells: 0 },
    keys: { blue: false, red: false, yellow: false },
    backpack: false,
  };
}

export function getMaxAmmo(inventory: PlayerInventory): AmmoState {
  const mult = inventory.backpack ? 2 : 1;
  return {
    bullets: 200 * mult,
    shells: 50 * mult,
    rockets: 50 * mult,
    cells: 300 * mult,
  };
}

export function getHealthCap(inventory: PlayerInventory): number {
  return inventory.health > HEALTH_CAP_NORMAL ? HEALTH_CAP_SUPER : HEALTH_CAP_NORMAL;
}

export function getArmorCap(inventory: PlayerInventory): number {
  return inventory.armorType === 'blue' ? ARMOR_CAP_BLUE : ARMOR_CAP_GREEN;
}

export function addAmmo(
  inventory: PlayerInventory,
  kind: keyof AmmoState,
  amount: number
): number {
  const max = getMaxAmmo(inventory)[kind];
  const before = inventory.ammo[kind];
  inventory.ammo[kind] = Math.min(max, before + amount);
  return inventory.ammo[kind] - before;
}

export function grantWeapon(inventory: PlayerInventory, weapon: WeaponSlot): boolean {
  if (inventory.weapons.has(weapon)) return false;
  inventory.weapons.add(weapon);
  inventory.selectedWeapon = weapon;
  return true;
}

export function addHealth(
  inventory: PlayerInventory,
  amount: number,
  options: { allowOver100?: boolean; maxCap?: number } = {}
): number {
  const cap = options.maxCap ?? (options.allowOver100 ? HEALTH_CAP_SUPER : HEALTH_CAP_NORMAL);
  const before = inventory.health;
  inventory.health = Math.min(cap, before + amount);
  return inventory.health - before;
}

export function setArmor(
  inventory: PlayerInventory,
  points: number,
  type: 'green' | 'blue'
): void {
  const cap = type === 'blue' ? ARMOR_CAP_BLUE : ARMOR_CAP_GREEN;
  if (type === 'blue' || inventory.armorType !== 'blue') {
    inventory.armorType = type;
  }
  inventory.armor = Math.min(cap, Math.max(inventory.armor, points));
}

export function addArmorBonus(inventory: PlayerInventory, amount: number): number {
  const cap = getArmorCap(inventory);
  const before = inventory.armor;
  inventory.armor = Math.min(cap, before + amount);
  return inventory.armor - before;
}

export function applySectorEffects(
  inventory: PlayerInventory,
  effects: SectorPlayerEffects,
  dtSeconds: number,
  powerups?: PlayerPowerups,
  now = performance.now()
): boolean {
  if (effects.instantKill) {
    if (powerups && shouldBlockSectorDamage(powerups, effects.damageKind, now)) {
      return false;
    }
    inventory.health = 0;
    return true;
  }

  if (
    effects.damagePercentPerSecond > 0 &&
    inventory.health > 0 &&
    powerups &&
    shouldBlockSectorDamage(powerups, effects.damageKind, now)
  ) {
    return false;
  }

  if (effects.damagePercentPerSecond > 0 && inventory.health > 0) {
    const loss =
      (effects.damagePercentPerSecond / 100) * HEALTH_CAP_NORMAL * dtSeconds;
    inventory.health = Math.max(0, inventory.health - loss);
    return inventory.health <= 0;
  }

  if (effects.healPerSecond > 0 && inventory.health > 0) {
    inventory.health = Math.min(
      HEALTH_CAP_SUPER,
      inventory.health + effects.healPerSecond * dtSeconds
    );
  }

  return false;
}

export function inventoryHudSnapshot(inventory: PlayerInventory) {
  return {
    health: Math.round(inventory.health),
    healthCap: getHealthCap(inventory),
    armor: Math.round(inventory.armor),
    armorCap: getArmorCap(inventory),
    ammo: { ...inventory.ammo },
    maxAmmo: getMaxAmmo(inventory),
    weapon: inventory.selectedWeapon,
    weapons: [...inventory.weapons],
    keys: { ...inventory.keys },
    alive: inventory.health > 0,
  };
}

export type PlayerHudSnapshot = ReturnType<typeof inventoryHudSnapshot>;
