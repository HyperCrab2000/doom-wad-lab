import { skyFlats } from '@/wad/constants/WadInfo';
import type { Sector } from '@/wad/interfaces/Sector';

/** GZDoom `area_t` for stacked-sector fake flats. */
export enum FakeFlatArea {
  normal = 0,
  above = 1,
  below = 2,
}

/** Resolved sector planes after `hw_FakeFlat` (classic maps: identity). */
export interface FakeSectorPlanes {
  floorheight: number;
  ceilingheight: number;
  floorpic: string;
  ceilingpic: string;
  /** Original sector reference (lighting, liquids, etc.). */
  source: Sector;
}

/**
 * Port of GZDoom `hw_FakeFlat`. Classic Doom maps have no `heightsec`; returns
 * the input sector unchanged. Hook point for Transfer_Heights / 3D floors later.
 */
export function hwFakeFlat(
  sector: Sector,
  _area: FakeFlatArea = FakeFlatArea.normal,
  _back = false
): FakeSectorPlanes {
  return {
    floorheight: sector.floorheight,
    ceilingheight: sector.ceilingheight,
    floorpic: sector.floorpic,
    ceilingpic: sector.ceilingpic,
    source: sector,
  };
}

export function isSkyFlat(flatName: string): boolean {
  return skyFlats.indexOf(flatName) >= 0;
}
