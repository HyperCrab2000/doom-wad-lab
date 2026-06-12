import type { Wad } from '@/wad/interfaces/Wad';
import { findWadLump } from '@/features/level-viewer/doomWadGraphics';
import type { StatusFaceLump } from '@/wad/game/statusFace';

/**
 * Logical face ids (Doom II names) and IWAD fallbacks.
 * Shareware / Ultimate Doom use STFST01, STFOUCH0, etc.
 */
export const STATUS_FACE_WAD_ALIASES: Record<StatusFaceLump, readonly string[]> = {
  STFGOD0: ['STFGOD0'],
  STFSTF0: ['STFSTF0', 'STFST01', 'STFST00'],
  STFSTF1: ['STFSTF1', 'STFEVL0', 'STFOUCH0'],
  STFSTF2: ['STFSTF2', 'STFST11', 'STFST10'],
  STFSTF3: ['STFSTF3', 'STFST21', 'STFST20'],
  STFSTF4: ['STFSTF4', 'STFST41', 'STFST40'],
  STFDEAD0: ['STFDEAD0'],
  STFKILL0: ['STFKILL0', 'STFOUCH0'],
};

export const STATUS_FACE_LUMPS = Object.keys(STATUS_FACE_WAD_ALIASES) as StatusFaceLump[];

export function resolveStatusFaceLumpName(wad: Wad, logical: StatusFaceLump): string | null {
  for (const name of STATUS_FACE_WAD_ALIASES[logical]) {
    if (findWadLump(wad, name)) return name;
  }
  return null;
}
