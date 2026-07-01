import { WadMap } from '@/wad/interfaces/WadMap';
import { skyFlats } from '@/wad/constants/WadInfo';
import { SectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';

export function isSkySector(map: WadMap, sectorIndex: number): boolean {
  if (sectorIndex < 0) return false;
  const sector = map.SECTORS[sectorIndex];
  if (!sector) return false;
  return skyFlats.includes(sector.ceilingpic) || skyFlats.includes(sector.floorpic);
}

/** Max sky-sector hops from the first outdoor sector seen leaving the camera room. */
export const MAX_SKY_PORTAL_CHAIN = 16;

export function shouldRenderFullscreenSkybox(
  map: WadMap,
  cameraSectorIndex: number,
  visibleSectors: Set<number> | null
): boolean {
  if (cameraSectorIndex < 0) return false;
  if (isSkySector(map, cameraSectorIndex)) return true;
  if (!visibleSectors) return false;
  for (const index of visibleSectors) {
    if (isSkySector(map, index)) return true;
  }
  return false;
}

export function countSkySectorsInView(
  map: WadMap,
  visibleSectors: ReadonlySet<number>
): number {
  let count = 0;
  for (const index of visibleSectors) {
    if (isSkySector(map, index)) count++;
  }
  return count;
}
