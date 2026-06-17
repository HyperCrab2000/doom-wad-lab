import { LUMP_CATEGORY } from '../../../gzstate/constants';
import type { WadLumpCategory } from '@/wad/catalog/categorizeLump';
import type { LineDef } from '@/wad/interfaces/LineDef';
import type { ParsedThingFlags } from '@/wad/parser/thingFlags';

export function lumpCategoryToCode(category: WadLumpCategory): number {
  switch (category) {
    case 'map':
      return LUMP_CATEGORY.MAP;
    case 'music':
      return LUMP_CATEGORY.MUSIC;
    case 'sound':
      return LUMP_CATEGORY.SOUND;
    case 'sprite':
      return LUMP_CATEGORY.SPRITE;
    case 'flat':
      return LUMP_CATEGORY.FLAT;
    case 'patch':
      return LUMP_CATEGORY.PATCH;
    case 'textureMeta':
      return LUMP_CATEGORY.TEXTURE_META;
    case 'palette':
      return LUMP_CATEGORY.PALETTE;
    case 'colormap':
      return LUMP_CATEGORY.COLORMAP;
    case 'storyText':
      return LUMP_CATEGORY.STORY_TEXT;
    case 'menuText':
      return LUMP_CATEGORY.MENU_TEXT;
    case 'intermission':
      return LUMP_CATEGORY.INTERMISSION;
    case 'demo':
      return LUMP_CATEGORY.DEMO;
    case 'midiMeta':
      return LUMP_CATEGORY.MIDI_META;
    case 'marker':
      return LUMP_CATEGORY.MARKER;
    default:
      return LUMP_CATEGORY.UNKNOWN;
  }
}

export function encodeClassicThingFlags(flags: ParsedThingFlags): number {
  let word = 0;
  if (flags.appearsOnEasy) word |= 0x1;
  if (flags.appearsOnMedium) word |= 0x2;
  if (flags.appearsOnHard) word |= 0x4;
  if (flags.isDeaf) word |= 0x8;
  if (flags.hideInSingleplayer) word |= 0x10;
  if (flags.hideInDeathmatch) word |= 0x20;
  if (flags.hideInCoop) word |= 0x40;
  if (flags.friendly) word |= 0x80;
  return word & 0xffff;
}

export function encodeClassicLineFlags(flags: LineDef['flags']): number {
  let word = 0;
  if (flags.impassible) word |= 1 << 0;
  if (flags.blockMonsters) word |= 1 << 1;
  if (flags.twoSided) word |= 1 << 2;
  if (flags.upperUnpegged) word |= 1 << 3;
  if (flags.lowerUnpegged) word |= 1 << 4;
  if (flags.secret) word |= 1 << 5;
  if (flags.blockSound) word |= 1 << 6;
  if (flags.notOnMap) word |= 1 << 7;
  if (flags.alreadyOnMap) word |= 1 << 8;
  return word >>> 0;
}

/** Convert raw Doom node child (uint16 with 0x8000 subsector flag) to GZSTATE u32. */
export function nodeChildToGzstate(rawChild: number): number {
  const child = rawChild & 0xffff;
  if (child & 0x8000) return ((child & 0x7fff) | 0x80000000) >>> 0;
  return child >>> 0;
}
