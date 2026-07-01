/** GZDRAW v1 binary format constants. Keep in sync with gzdoom-project/src/gzdraw_dump.cpp */

export const GZDRAW_MAGIC = 0x5244_5247; // 'GZDR' per spec (same as gzdoom gzdraw_dump.cpp)
export const GZDRAW_VERSION = 1;
export const GZDRAW_HEADER_SIZE = 64;
export const GZDRAW_MAP_NAME_BYTES = 32;
export const GZDRAW_SECTION_ENTRY_SIZE = 16;
export const GZDRAW_FLAGS_CRC_ENABLED = 1;
export const GZDRAW_NO_SEG = 0xffff;

export const GZDRAW_SECTION = {
  CAMERA: 1,
  SUBSECTORS: 2,
  SECTORS: 3,
  WALLS: 4,
  SPRITES: 5,
  PORTAL_SNAPSHOT: 6,
  FLAT_DRAWS: 7,
  DRAW_META: 8,
} as const;

export const GZDRAW_SECTION_NAMES: Record<number, string> = {
  [GZDRAW_SECTION.CAMERA]: 'camera',
  [GZDRAW_SECTION.SUBSECTORS]: 'subsectors',
  [GZDRAW_SECTION.SECTORS]: 'sectors',
  [GZDRAW_SECTION.WALLS]: 'walls',
  [GZDRAW_SECTION.SPRITES]: 'sprites',
  [GZDRAW_SECTION.PORTAL_SNAPSHOT]: 'portal_snapshot',
  [GZDRAW_SECTION.FLAT_DRAWS]: 'flat_draws',
  [GZDRAW_SECTION.DRAW_META]: 'draw_meta',
};
