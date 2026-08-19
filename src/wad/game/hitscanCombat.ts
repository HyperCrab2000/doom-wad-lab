import { playerEyeHeight } from '@/wad/constants/GameInfo';
import { ThingKind } from '@/wad/constants/ThingTypes';
import { hasHitscanLineOfSight } from '@/wad/game/hitscanTrace';
import type { WeaponSlot } from '@/wad/game/playerInventory';
import type { WadMap } from '@/wad/interfaces/WadMap';

export interface HitscanCandidate {
  thingIndex: number;
  x: number;
  y: number;
  kind: ThingKind;
}

export const WEAPON_HITSCAN_DAMAGE: Partial<Record<WeaponSlot, number>> = {
  fist: 10,
  chainsaw: 15,
  pistol: 35,
  shotgun: 70,
  superShotgun: 140,
  chaingun: 35,
};

const DEFAULT_DAMAGE = 35;
const AIM_CONE_DEG = 7;
const MAX_RANGE = 1600;

export function findHitscanTarget(params: {
  map: WadMap;
  originX: number;
  originY: number;
  originZ: number;
  yaw: number;
  candidates: HitscanCandidate[];
  skipIndices?: ReadonlySet<number>;
}): HitscanCandidate | null {
  const { map, originX, originY, originZ, yaw, candidates, skipIndices } = params;
  const cosLimit = Math.cos((AIM_CONE_DEG * Math.PI) / 180);
  const forwardX = Math.cos(yaw);
  const forwardY = Math.sin(yaw);
  const origin = { x: originX, y: originY, z: originZ };

  let best: HitscanCandidate | null = null;
  let bestDist = Infinity;

  for (const entry of candidates) {
    if (skipIndices?.has(entry.thingIndex)) continue;
    const dx = entry.x - originX;
    const dy = entry.y - originY;
    const dist = Math.hypot(dx, dy);
    if (dist < 1 || dist > MAX_RANGE) continue;
    const dot = (dx / dist) * forwardX + (dy / dist) * forwardY;
    if (dot < cosLimit) continue;
    if (!hasHitscanLineOfSight(map, origin, { x: entry.x, y: entry.y })) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }

  return best;
}

export function defaultThingHealth(kind: ThingKind): number {
  if (kind === ThingKind.Barrel) return 20;
  if (kind === ThingKind.Boss) return 400;
  return 30;
}

export function applyHitscanDamage(params: {
  thingIndex: number;
  amount: number;
  healthByThing: Map<number, number>;
}): { killed: boolean; remaining: number } {
  const prev = params.healthByThing.get(params.thingIndex) ?? 30;
  const remaining = prev - params.amount;
  params.healthByThing.set(params.thingIndex, remaining);
  return { killed: remaining <= 0, remaining };
}

export function shootZFromFeet(floorZ: number): number {
  return floorZ + playerEyeHeight;
}
