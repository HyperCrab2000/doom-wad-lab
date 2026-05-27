import { DOOM_THING_MAP } from '@/wad/constants/doomThingMap';
import type { ThingType } from '@/wad/constants/ThingTypes';

export interface IndexedThingType extends ThingType {
  key: string;
}

const BY_ID = new Map<number, IndexedThingType>();

for (const [key, entry] of Object.entries(DOOM_THING_MAP)) {
  BY_ID.set(entry.id, { ...entry, key });
}

export function getThingTypeById(id: number): IndexedThingType | null {
  return BY_ID.get(id) ?? null;
}

export function getAllIndexedThingTypes(): IndexedThingType[] {
  return [...BY_ID.values()].sort((a, b) => a.id - b.id);
}

export function summarizeMapThings(
  things: Array<{ type: number }>
): Array<{ type: number; count: number; key: string | null; description: string | null; sprite: string | null }> {
  const counts = new Map<number, number>();
  for (const thing of things) {
    counts.set(thing.type, (counts.get(thing.type) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([type, count]) => {
      const info = getThingTypeById(type);
      return {
        type,
        count,
        key: info?.key ?? null,
        description: info?.description ?? null,
        sprite: info?.sprite ?? null,
      };
    })
    .sort((a, b) => b.count - a.count);
}
