import type { SectorDamageKind } from '@/wad/game/sectorSpecialRuntime';

export type PowerupKind =
  | 'invuln'
  | 'berserk'
  | 'invis'
  | 'radSuit'
  | 'lightAmp'
  | 'computerMap';

export interface PlayerPowerups {
  invulnUntil: number;
  berserkUntil: number;
  invisUntil: number;
  radSuitUntil: number;
  lightAmpUntil: number;
  computerMap: boolean;
}

/** Vanilla durations at 35 Hz, converted to ms. */
export const POWERUP_DURATION_MS: Record<Exclude<PowerupKind, 'computerMap'>, number> = {
  invuln: 30 * 1000,
  berserk: 60 * 1000,
  invis: 60 * 1000,
  radSuit: 60 * 1000,
  lightAmp: 60 * 1000,
};

export function createDefaultPowerups(): PlayerPowerups {
  return {
    invulnUntil: 0,
    berserkUntil: 0,
    invisUntil: 0,
    radSuitUntil: 0,
    lightAmpUntil: 0,
    computerMap: false,
  };
}

export function resetPowerups(target: PlayerPowerups): void {
  const fresh = createDefaultPowerups();
  target.invulnUntil = fresh.invulnUntil;
  target.berserkUntil = fresh.berserkUntil;
  target.invisUntil = fresh.invisUntil;
  target.radSuitUntil = fresh.radSuitUntil;
  target.lightAmpUntil = fresh.lightAmpUntil;
  target.computerMap = fresh.computerMap;
}

export function grantPowerup(
  powerups: PlayerPowerups,
  kind: PowerupKind,
  now = performance.now()
): void {
  if (kind === 'computerMap') {
    powerups.computerMap = true;
    return;
  }
  const duration = POWERUP_DURATION_MS[kind];
  const until = now + duration;
  switch (kind) {
    case 'invuln':
      powerups.invulnUntil = until;
      break;
    case 'berserk':
      powerups.berserkUntil = until;
      break;
    case 'invis':
      powerups.invisUntil = until;
      break;
    case 'radSuit':
      powerups.radSuitUntil = until;
      break;
    case 'lightAmp':
      powerups.lightAmpUntil = until;
      break;
    default:
      break;
  }
}

export function tickPowerups(powerups: PlayerPowerups, now = performance.now()): void {
  if (powerups.invulnUntil > 0 && now >= powerups.invulnUntil) powerups.invulnUntil = 0;
  if (powerups.berserkUntil > 0 && now >= powerups.berserkUntil) powerups.berserkUntil = 0;
  if (powerups.invisUntil > 0 && now >= powerups.invisUntil) powerups.invisUntil = 0;
  if (powerups.radSuitUntil > 0 && now >= powerups.radSuitUntil) powerups.radSuitUntil = 0;
  if (powerups.lightAmpUntil > 0 && now >= powerups.lightAmpUntil) powerups.lightAmpUntil = 0;
}

export function hasInvulnerability(powerups: PlayerPowerups, now = performance.now()): boolean {
  return powerups.invulnUntil > now;
}

export function hasBerserk(powerups: PlayerPowerups, now = performance.now()): boolean {
  return powerups.berserkUntil > now;
}

export function hasRadiationSuit(powerups: PlayerPowerups, now = performance.now()): boolean {
  return powerups.radSuitUntil > now;
}

/** Slime/nukage damage ignored with rad suit (vanilla P_Player). */
export function shouldBlockSectorDamage(
  powerups: PlayerPowerups,
  damageKind: SectorDamageKind | null,
  now = performance.now()
): boolean {
  if (hasInvulnerability(powerups, now)) return true;
  if (!damageKind) return false;
  if (!hasRadiationSuit(powerups, now)) return false;
  return damageKind === 'slime' || damageKind === 'sludge' || damageKind === 'lava';
}

export function powerupsHudSnapshot(powerups: PlayerPowerups, now = performance.now()) {
  return {
    invuln: hasInvulnerability(powerups, now),
    berserk: hasBerserk(powerups, now),
    invis: powerups.invisUntil > now,
    radSuit: hasRadiationSuit(powerups, now),
    lightAmp: powerups.lightAmpUntil > now,
    computerMap: powerups.computerMap,
  };
}
