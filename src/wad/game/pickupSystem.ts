import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import { ThingKind } from '@/wad/constants/ThingTypes';
import { applyPickupForThingType } from '@/wad/game/pickupDefinitions';
import type { PickupContext } from '@/wad/game/pickupDefinitions';
import type { PlayerInventory } from '@/wad/game/playerInventory';
import type { Thing } from '@/wad/interfaces/Thing';
import type { WadMap } from '@/wad/interfaces/WadMap';
import { hasValidFlags } from '@/wad/renderer/utils/hasValidFlags';

const PICKUP_KINDS = new Set<ThingKind>([
  ThingKind.Pickup,
  ThingKind.Weapon,
  ThingKind.Key,
  ThingKind.Powerup,
  ThingKind.Artifact,
]);

export class PickupTracker {
  private readonly picked = new Set<Thing>();

  clear(): void {
    this.picked.clear();
  }

  isPicked(thing: Thing): boolean {
    return this.picked.has(thing);
  }

  markPicked(thing: Thing): void {
    this.picked.add(thing);
  }
}

export interface PickupTickResult {
  message: string | null;
  sfx: 'item' | 'weapon' | null;
  thingIndex: number | null;
}

export function tryPickups(
  map: WadMap,
  playerX: number,
  playerY: number,
  playerRadius: number,
  inventory: PlayerInventory,
  tracker: PickupTracker,
  ctx: PickupContext = {}
): PickupTickResult {
  let lastMessage: string | null = null;
  let lastSfx: 'item' | 'weapon' | null = null;
  let lastIndex: number | null = null;

  map.THINGS.forEach((thing, thingIndex) => {
    if (tracker.isPicked(thing)) return;
    if (!hasValidFlags(thing)) return;

    const thingType = DOOM_THING_MAP_BY_ID[thing.type];
    if (!thingType?.kind || !PICKUP_KINDS.has(thingType.kind)) return;

    const touchRadius = Math.max(20, thingType.radius ?? 20) + playerRadius;
    const dx = thing.x - playerX;
    const dy = thing.y - playerY;
    if (dx * dx + dy * dy > touchRadius * touchRadius) return;

    const result = applyPickupForThingType(thing.type, inventory, ctx);
    if (!result.picked) return;

    tracker.markPicked(thing);
    lastMessage = result.message;
    lastSfx = result.sfx;
    lastIndex = thingIndex;
  });

  return { message: lastMessage, sfx: lastSfx, thingIndex: lastIndex };
}
