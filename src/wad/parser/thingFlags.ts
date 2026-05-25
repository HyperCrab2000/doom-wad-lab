import { difficulty } from '@/wad/constants/WadInfo';
import { Thing } from '@/wad/interfaces/Thing';

export interface ParsedThingFlags {
  difficulty: difficulty;
  appearsOnEasy: boolean;
  appearsOnMedium: boolean;
  appearsOnHard: boolean;
  isDeaf: boolean;
  hideInSingleplayer: boolean;
  hideInDeathmatch: boolean;
  hideInCoop: boolean;
  friendly?: boolean;
  isDormant?: boolean;
  class1Only?: boolean;
  class2Only?: boolean;
  class3Only?: boolean;
}

const EXCLUDED_SPAWN_THING_TYPES = new Set([
  1, // player 1 start
  2, // player 2 start
  3, // player 3 start
  4, // player 4 start
  11, // deathmatch start
  14, // teleport landing
]);

export function parseClassicThingFlags(value: number): ParsedThingFlags {
  const appearsOnEasy = (value & 0x1) !== 0;
  const appearsOnMedium = (value & 0x2) !== 0;
  const appearsOnHard = (value & 0x4) !== 0;

  return {
    appearsOnEasy,
    appearsOnMedium,
    appearsOnHard,
    difficulty: appearsOnEasy
      ? difficulty.easy
      : appearsOnMedium
        ? difficulty.intermediate
        : difficulty.hard,
    isDeaf: (value & 0x8) !== 0,
    hideInSingleplayer: (value & 0x10) !== 0,
    hideInDeathmatch: (value & 0x20) !== 0,
    hideInCoop: (value & 0x40) !== 0,
    friendly: (value & 0x80) !== 0,
  };
}

export function parseExtendedThingFlags(value: number): ParsedThingFlags {
  const appearsOnEasy = (value & 0x1) !== 0;
  const appearsOnMedium = (value & 0x2) !== 0;
  const appearsOnHard = (value & 0x4) !== 0;

  return {
    appearsOnEasy,
    appearsOnMedium,
    appearsOnHard,
    difficulty: appearsOnEasy
      ? difficulty.easy
      : appearsOnMedium
        ? difficulty.intermediate
        : difficulty.hard,
    isDeaf: (value & 0x8) !== 0,
    isDormant: (value & 0x10) !== 0,
    class1Only: (value & 0x20) !== 0,
    class2Only: (value & 0x40) !== 0,
    class3Only: (value & 0x80) !== 0,
    hideInCoop: (value & 0x100) !== 0 || (value & 0x400) !== 0,
    hideInSingleplayer: (value & 0x200) !== 0 || (value & 0x400) !== 0,
    hideInDeathmatch: (value & 0x100) !== 0 || (value & 0x200) !== 0,
  };
}

export function isExcludedSpawnThing(type: number): boolean {
  return EXCLUDED_SPAWN_THING_TYPES.has(type);
}

/** Single-player Ultra-Violence: hard skill bit set, no deathmatch-only spawns. */
export function hasValidFlags(thing: Thing): boolean {
  const flags = thing.flags;
  if (!flags) return false;
  if (isExcludedSpawnThing(thing.type)) return false;
  if (flags.hideInSingleplayer) return false;
  return flags.appearsOnHard === true;
}
