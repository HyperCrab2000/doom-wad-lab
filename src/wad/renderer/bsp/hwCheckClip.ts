import type { WadMap } from '@/wad/interfaces/WadMap';
import { skyFlats } from '@/wad/constants/WadInfo';

function isSkyFlat(name: string): boolean {
  return skyFlats.includes(name);
}

function textureValid(name: string | undefined): boolean {
  return !!name && name !== '-';
}

export interface HwCheckClipOptions {
  /** When set, missing lump names do not block the view (GZDoom `tex->isValid()`). */
  isValidTexture?: (name: string) => boolean;
}

/**
 * Port of GZDoom `hw_CheckClip` (`hw_fakeflat.cpp`) — classic maps, no portals/slopes.
 * Returns true when the two-sided line should extend the angular clipper.
 */
export function hwCheckClip(
  map: WadMap,
  lineIndex: number,
  sideIndex: number,
  frontSectorIndex: number,
  backSectorIndex: number,
  options: HwCheckClipOptions = {}
): boolean {
  const side = map.SIDEDEFS[sideIndex];
  const line = map.LINEDEFS[lineIndex];
  if (!side || !line) return false;

  const front = map.SECTORS[frontSectorIndex];
  const back = map.SECTORS[backSectorIndex];
  if (!front || !back) return false;

  const hasTex = (name: string | undefined): boolean => {
    if (!textureValid(name)) return false;
    if (options.isValidTexture && name) return options.isValidTexture(name);
    return true;
  };

  const fsCeil = front.ceilingheight;
  const fsFloor = front.floorheight;
  const bsCeil = back.ceilingheight;
  const bsFloor = back.floorheight;

  const bothSkyCeil = isSkyFlat(front.ceilingpic) && isSkyFlat(back.ceilingpic);
  const bothSkyFloor = isSkyFlat(front.floorpic) && isSkyFlat(back.floorpic);

  // Back ceiling below front floor.
  if (bsCeil <= fsFloor) {
    if (!hasTex(side.topTexture)) return false;
    if (bothSkyCeil) return false;
    return true;
  }

  // Front ceiling below back floor.
  if (fsCeil <= bsFloor) {
    if (!hasTex(side.bottomTexture)) return false;
    if (bothSkyCeil) return false;
    return true;
  }

  // Back sector closed (invalid / crusher).
  if (bsCeil <= bsFloor) {
    if (bsCeil < fsCeil) {
      if (!hasTex(side.topTexture)) return false;
    }
    if (bsFloor > fsFloor) {
      if (!hasTex(side.bottomTexture)) return false;
    }
    if (bothSkyCeil) return false;
    if (bothSkyFloor) return false;
    return true;
  }

  return false;
}
