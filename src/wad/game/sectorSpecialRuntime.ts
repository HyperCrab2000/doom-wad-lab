import {
  Direction,
  DiagonalDirection,
  SectorKind,
  SectorSpecials,
  ExtendedSectorSpecials,
  type SectorType,
} from '@/wad/constants/SectorSpecials';
import type { Sector } from '@/wad/interfaces/Sector';

/** Doom uses 35 tics per second. */
export const DOOM_TICS_PER_SECOND = 35;

export type SectorDamageKind = 'generic' | 'lava' | 'sludge' | 'slime';

export interface SectorDamageSpec {
  /** Percent of max health per second (Doom uses 100 health). */
  percentPerSecond: number;
  kind: SectorDamageKind;
  instantKill?: boolean;
}

export interface SectorImpulse {
  /** Map units per second added to player velocity (x = east, y = north in WAD space). */
  dx: number;
  dy: number;
}

export interface SectorTimedDoorSpec {
  delaySeconds: number;
  mode: 'close' | 'open';
  /** Ceiling move speed in map units per second. */
  speed: number;
}

export interface SectorPlayerEffects {
  push: SectorImpulse;
  frictionScale: number;
  damagePercentPerSecond: number;
  damageKind: SectorDamageKind | null;
  instantKill: boolean;
  healPerSecond: number;
  endLevelOnDeath: boolean;
  isSecret: boolean;
}

const DAMAGE_BY_TYPE: Record<number, SectorDamageSpec> = {
  4: { percentPerSecond: 20, kind: 'generic' },
  5: { percentPerSecond: 10, kind: 'generic' },
  7: { percentPerSecond: 5, kind: 'generic' },
  11: { percentPerSecond: 20, kind: 'generic' },
  16: { percentPerSecond: 20, kind: 'generic' },
  68: { percentPerSecond: 20, kind: 'generic' },
  69: { percentPerSecond: 10, kind: 'generic' },
  71: { percentPerSecond: 5, kind: 'generic' },
  75: { percentPerSecond: 20, kind: 'generic' },
  80: { percentPerSecond: 20, kind: 'generic' },
  82: { percentPerSecond: 5, kind: 'lava' },
  83: { percentPerSecond: 8, kind: 'lava' },
  84: { percentPerSecond: 5, kind: 'lava' },
  85: { percentPerSecond: 4, kind: 'sludge' },
  105: { percentPerSecond: 0, kind: 'slime' },
  115: { percentPerSecond: 999, kind: 'generic', instantKill: true },
  116: { percentPerSecond: 0, kind: 'slime' },
};

const TIMED_DOOR_BY_TYPE: Record<number, SectorTimedDoorSpec> = {
  10: { delaySeconds: 30, mode: 'close', speed: 32 },
  14: { delaySeconds: 300, mode: 'open', speed: 32 },
  74: { delaySeconds: 30, mode: 'close', speed: 32 },
  78: { delaySeconds: 300, mode: 'open', speed: 32 },
};

const WIND_BY_TYPE: Record<number, SectorImpulse> = buildCardinalWindTable(40, [
  [Direction.east, 5],
  [Direction.east, 10],
  [Direction.east, 25],
  [Direction.north, 5],
  [Direction.north, 10],
  [Direction.north, 25],
  [Direction.south, 5],
  [Direction.south, 10],
  [Direction.south, 25],
  [Direction.west, 5],
  [Direction.west, 10],
  [Direction.west, 25],
]);

const SCROLL_BY_TYPE: Record<number, SectorImpulse> = {
  ...buildCardinalWindTable(201, [
    [Direction.north, 5],
    [Direction.north, 10],
    [Direction.north, 25],
    [Direction.east, 5],
    [Direction.east, 10],
    [Direction.east, 25],
    [Direction.south, 5],
    [Direction.south, 10],
    [Direction.south, 25],
    [Direction.west, 5],
    [Direction.west, 10],
    [Direction.west, 25],
    [Direction.northwest, 5],
    [Direction.northwest, 10],
    [Direction.northwest, 25],
    [Direction.northeast, 5],
    [Direction.northeast, 10],
    [Direction.northeast, 25],
    [Direction.southeast, 5],
    [Direction.southeast, 10],
    [Direction.southeast, 25],
    [Direction.southwest, 5],
    [Direction.southwest, 10],
    [Direction.southwest, 25],
    [Direction.east, 5],
    [Direction.east, 10],
    [Direction.east, 25],
    [Direction.east, 30],
    [Direction.east, 35],
    [Direction.north, 5],
    [Direction.north, 10],
    [Direction.north, 25],
    [Direction.north, 30],
    [Direction.north, 35],
    [Direction.south, 5],
    [Direction.south, 10],
    [Direction.south, 25],
    [Direction.south, 30],
    [Direction.south, 35],
    [Direction.west, 5],
    [Direction.west, 10],
    [Direction.west, 25],
    [Direction.west, 30],
    [Direction.west, 35],
  ]),
  84: impulseFromDirection(Direction.east, 10),
};

function impulseFromDirection(
  direction: Direction | DiagonalDirection,
  amount: number
): SectorImpulse {
  const scale = amount * 8;
  switch (direction) {
    case Direction.east:
      return { dx: scale, dy: 0 };
    case Direction.west:
      return { dx: -scale, dy: 0 };
    case Direction.north:
      return { dx: 0, dy: scale };
    case Direction.south:
      return { dx: 0, dy: -scale };
    case DiagonalDirection.northeast:
      return { dx: scale * 0.707, dy: scale * 0.707 };
    case DiagonalDirection.northwest:
      return { dx: -scale * 0.707, dy: scale * 0.707 };
    case DiagonalDirection.southeast:
      return { dx: scale * 0.707, dy: -scale * 0.707 };
    case DiagonalDirection.southwest:
      return { dx: -scale * 0.707, dy: -scale * 0.707 };
    default:
      return { dx: 0, dy: 0 };
  }
}

function buildCardinalWindTable(
  startId: number,
  rows: Array<[Direction | DiagonalDirection, number]>
): Record<number, SectorImpulse> {
  const out: Record<number, SectorImpulse> = {};
  rows.forEach(([direction, amount], index) => {
    out[startId + index] = impulseFromDirection(direction, amount);
  });
  return out;
}

export function getSectorDamage(type: number): SectorDamageSpec | null {
  return DAMAGE_BY_TYPE[type] ?? null;
}

export function getSectorWind(type: number): SectorImpulse | null {
  return WIND_BY_TYPE[type] ?? null;
}

export function getSectorScroll(type: number, tag = 0): SectorImpulse | null {
  if (type === 118) {
    if (tag <= 0) return null;
    const angle = ((tag % 360) * Math.PI) / 180;
    const strength = Math.min(25, Math.max(5, tag % 25 || 5));
    const scale = strength * 8;
    return { dx: Math.cos(angle) * scale, dy: Math.sin(angle) * scale };
  }
  return SCROLL_BY_TYPE[type] ?? null;
}

export function getSectorTimedDoor(type: number): SectorTimedDoorSpec | null {
  return TIMED_DOOR_BY_TYPE[type] ?? null;
}

export function isSectorLowFriction(type: number): boolean {
  return type === 79;
}

export function isSecretSectorType(type: number): boolean {
  return type === 9;
}

export function isStairBuilderSectorType(type: number): boolean {
  return type === 26 || type === 27;
}

export function isEndOnDeathSectorType(type: number): boolean {
  return type === 11 || type === 75;
}

export function getSectorHealPerSecond(type: number): number {
  if (type !== 196) return 0;
  return DOOM_TICS_PER_SECOND / 32;
}

export function getSectorPlayerEffects(sector: Sector | null): SectorPlayerEffects {
  const empty: SectorPlayerEffects = {
    push: { dx: 0, dy: 0 },
    frictionScale: 1,
    damagePercentPerSecond: 0,
    damageKind: null,
    instantKill: false,
    healPerSecond: 0,
    endLevelOnDeath: false,
    isSecret: false,
  };
  if (!sector) return empty;

  const type = sector.type;
  const damage = getSectorDamage(type);
  const wind = getSectorWind(type);
  const scroll = getSectorScroll(type, sector.tag);
  const push = {
    dx: (wind?.dx ?? 0) + (scroll?.dx ?? 0),
    dy: (wind?.dy ?? 0) + (scroll?.dy ?? 0),
  };

  return {
    push,
    frictionScale: isSectorLowFriction(type) ? 0.35 : 1,
    damagePercentPerSecond: damage?.percentPerSecond ?? 0,
    damageKind: damage?.kind ?? null,
    instantKill: damage?.instantKill ?? false,
    healPerSecond: getSectorHealPerSecond(type),
    endLevelOnDeath: isEndOnDeathSectorType(type),
    isSecret: isSecretSectorType(type),
  };
}

/** Apply presentation hints from sector type (liquids, fog) when flats are ambiguous. */
export function applySectorTypePresentation(sector: Sector): void {
  const damage = getSectorDamage(sector.type);
  if (damage && !sector.liquidKind) {
    switch (damage.kind) {
      case 'lava':
        sector.liquidKind = 'lava';
        sector.liquidColor = [1.0, 0.22, 0.02];
        sector.liquidStrength = 0.95;
        break;
      case 'sludge':
        sector.liquidKind = 'slime';
        sector.liquidColor = [0.35, 0.55, 0.2];
        sector.liquidStrength = 0.7;
        break;
      default:
        sector.liquidKind = 'slime';
        sector.liquidColor = [0.12, 0.88, 0.14];
        sector.liquidStrength = 1.0;
        break;
    }
  }

  if (sector.type === 87) {
    sector.fogDensity = Math.max(sector.fogDensity ?? 0.25, 0.55);
    sector.fogColor = sector.fogColor ?? [0.12, 0.14, 0.18];
  }
}

export const ALL_SECTOR_TYPE_ROWS: SectorType[] = mergeSectorTypeRows(
  SectorSpecials,
  ExtendedSectorSpecials
);

function mergeSectorTypeRows(...groups: SectorType[][]): SectorType[] {
  const byId = new Map<number, SectorType>();
  for (const row of groups.flat()) {
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      continue;
    }
    if (existing.kind === SectorKind.light && row.kind !== SectorKind.light) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
