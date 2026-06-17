import { categorizeWadLumpName, type WadLumpCategory } from '@/wad/catalog/categorizeLump';
import type { Lump } from '@/wad/interfaces/Lump';

/** Marker-range walk matching GZDoom gzstate_dump (S_START/S_END, F_START/F1_END, etc.). */
export function collectMarkerRangeNames(lumpInfo: Lump[], startLetter: string): string[] {
  let inRange = false;
  const names: string[] = [];
  const letter = startLetter.toUpperCase();

  for (const lump of lumpInfo) {
    const name = String(lump.name).toUpperCase();
    if (name.length >= 5 && name[0] === letter && name.includes('_START')) {
      inRange = true;
      continue;
    }
    if (name.length >= 5 && name[0] === letter && name.includes('_END')) {
      inRange = false;
      continue;
    }
    if (inRange) names.push(name);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Unique IWAD lump names for a category, sorted — matches GZDoom CollectAssetNames. */
export function collectCategoryNames(lumpInfo: Lump[], category: WadLumpCategory): string[] {
  const unique = new Set<string>();
  for (const lump of lumpInfo) {
    const name = String(lump.name).toUpperCase();
    if (categorizeWadLumpName(name) === category) unique.add(name);
  }
  return [...unique].sort((a, b) => a.localeCompare(b));
}
