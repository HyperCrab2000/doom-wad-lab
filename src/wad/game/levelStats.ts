import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import { ThingKind } from '@/wad/constants/ThingTypes';
import type { Sector } from '@/wad/interfaces/Sector';
import type { Thing } from '@/wad/interfaces/Thing';
import type { WadMap } from '@/wad/interfaces/WadMap';
import { hasValidFlags, isExcludedSpawnThing } from '@/wad/parser/thingFlags';
import { isSecretSectorType } from './sectorSpecialRuntime';

const MONSTER_KINDS = new Set<ThingKind>([ThingKind.Monster, ThingKind.Boss, ThingKind.Barrel]);
const ITEM_KINDS = new Set<ThingKind>([
  ThingKind.Pickup,
  ThingKind.Weapon,
  ThingKind.Key,
  ThingKind.Powerup,
  ThingKind.Artifact,
]);

export interface LevelStatTotals {
  monsters: number;
  items: number;
  secrets: number;
}

export interface LevelStatProgress {
  monsters: number;
  items: number;
  secrets: number;
}

export interface LevelStatsSnapshot {
  totals: LevelStatTotals;
  found: LevelStatProgress;
}

export function compareDoomMapNames(a: string, b: string): number {
  const mapA = /^MAP(\d+)$/i.exec(a);
  const mapB = /^MAP(\d+)$/i.exec(b);
  if (mapA && mapB) return Number(mapA[1]) - Number(mapB[1]);

  const epA = /^E(\d+)M(\d+)$/i.exec(a);
  const epB = /^E(\d+)M(\d+)$/i.exec(b);
  if (epA && epB) {
    const orderA = Number(epA[1]) * 100 + Number(epA[2]);
    const orderB = Number(epB[1]) * 100 + Number(epB[2]);
    return orderA - orderB;
  }

  return a.localeCompare(b);
}

export function sortDoomMapNames(mapNames: string[]): string[] {
  return [...mapNames].sort(compareDoomMapNames);
}

export function getNextMapName(mapNames: string[], current: string): string | null {
  const sorted = sortDoomMapNames(mapNames);
  const index = sorted.indexOf(current);
  if (index < 0) return sorted[0] ?? null;
  return sorted[index + 1] ?? null;
}

function isCountableThing(thing: Thing): boolean {
  if (!hasValidFlags(thing)) return false;
  if (isExcludedSpawnThing(thing.type)) return false;
  if (thing.type === 1) return false;
  return Boolean(DOOM_THING_MAP_BY_ID[thing.type]);
}

export class LevelStatsTracker {
  private totals: LevelStatTotals = { monsters: 0, items: 0, secrets: 0 };
  private found: LevelStatProgress = { monsters: 0, items: 0, secrets: 0 };
  private readonly visitedSecretSectors = new Set<number>();
  private readonly collectedItemThings = new Set<number>();
  private readonly secretSectorIndices = new Set<number>();
  private itemThings: Array<{ index: number; thing: Thing; radius: number }> = [];

  reset(map: WadMap): void {
    this.totals = { monsters: 0, items: 0, secrets: 0 };
    this.found = { monsters: 0, items: 0, secrets: 0 };
    this.visitedSecretSectors.clear();
    this.collectedItemThings.clear();
    this.secretSectorIndices.clear();
    this.itemThings = [];

    map.SECTORS.forEach((sector, sectorIndex) => {
      if (isSecretSectorType(sector.type)) {
        this.secretSectorIndices.add(sectorIndex);
        this.totals.secrets += 1;
      }
    });

    map.THINGS.forEach((thing, index) => {
      if (!isCountableThing(thing)) return;
      const thingType = DOOM_THING_MAP_BY_ID[thing.type];
      if (!thingType?.kind) return;

      if (MONSTER_KINDS.has(thingType.kind)) {
        this.totals.monsters += 1;
        return;
      }

      if (ITEM_KINDS.has(thingType.kind)) {
        this.totals.items += 1;
        this.itemThings.push({
          index,
          thing,
          radius: Math.max(20, thingType.radius ?? 20),
        });
      }
    });
  }

  updateFromPlayer(map: WadMap, sector: Sector | null, x: number, y: number): void {
    if (!sector) return;

    const sectorIndex = map.SECTORS.indexOf(sector);
    if (sectorIndex >= 0 && this.secretSectorIndices.has(sectorIndex)) {
      if (!this.visitedSecretSectors.has(sectorIndex)) {
        this.visitedSecretSectors.add(sectorIndex);
        this.found.secrets = this.visitedSecretSectors.size;
      }
    }

    for (const entry of this.itemThings) {
      if (this.collectedItemThings.has(entry.index)) continue;
      const dx = entry.thing.x - x;
      const dy = entry.thing.y - y;
      if (dx * dx + dy * dy <= entry.radius * entry.radius) {
        this.collectedItemThings.add(entry.index);
        this.found.items = this.collectedItemThings.size;
      }
    }
  }

  registerItemPickup(thingIndex: number): void {
    if (this.collectedItemThings.has(thingIndex)) return;
    this.collectedItemThings.add(thingIndex);
    this.found.items = this.collectedItemThings.size;
  }

  /** Reserved for future combat — increments kill count. */
  registerMonsterKill(): void {
    this.found.monsters = Math.min(this.totals.monsters, this.found.monsters + 1);
  }

  snapshot(): LevelStatsSnapshot {
    return {
      totals: { ...this.totals },
      found: { ...this.found },
    };
  }
}

export function percent(found: number, total: number): number {
  if (total <= 0) return 100;
  return Math.min(100, Math.round((found / total) * 100));
}
