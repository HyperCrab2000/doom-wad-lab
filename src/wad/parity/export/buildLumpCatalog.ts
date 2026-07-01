import { crc32 } from '../../../../gzstate/crc32';
import { internString } from '../../../../gzstate/gzstateWriter';
import type { GzstateLumpCatalogEntry } from '../../../../gzstate/types';
import { categorizeWadLumpName } from '@/wad/catalog/categorizeLump';
import type { Wad } from '@/wad/interfaces/Wad';

import { lumpCategoryToCode } from '../encodeDoomFormats';

/** IWAD lump catalog — first directory entry per short name, sorted (matches GZDoom). */
export function buildLumpCatalog(wad: Wad, strings: string[]): GzstateLumpCatalogEntry[] {
  const seen = new Set<string>();
  const entries: GzstateLumpCatalogEntry[] = [];

  for (const lump of wad.lumpInfo) {
    const name = String(lump.name).toUpperCase();
    if (seen.has(name)) continue;
    seen.add(name);
    const bytes = new Uint8Array(lump.data);
    entries.push({
      nameIndex: internString(strings, name),
      byteLength: bytes.byteLength,
      crc32: crc32(bytes),
      category: lumpCategoryToCode(categorizeWadLumpName(name)),
    });
  }

  return entries.sort((a, b) => {
    const nameA = strings[a.nameIndex] ?? '';
    const nameB = strings[b.nameIndex] ?? '';
    return nameA.localeCompare(nameB);
  });
}
