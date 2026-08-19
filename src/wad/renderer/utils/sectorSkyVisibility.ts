import { WadMap } from '@/wad/interfaces/WadMap';
import type { Sector } from '@/wad/interfaces/Sector';
import { skyFlats } from '@/wad/constants/WadInfo';
import { normalizeFlatName } from '@/wad/renderer/renderGame/sectorLighting';

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
  visibleSectors: Set<number> | null,
  _frameParityMode = false
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

/** True when outdoor sky is in the supplement pool but not drawn as a flat mesh (opening view). */
export function hasOutdoorSkyThroughOpening(
  map: WadMap,
  skyVisibilitySectors: ReadonlySet<number> | null,
  visibleFlatSectors: ReadonlySet<number> | null,
): boolean {
  if (!skyVisibilitySectors?.size) return false;
  for (const index of skyVisibilitySectors) {
    if (isSkySector(map, index) && !visibleFlatSectors?.has(index)) {
      return true;
    }
  }
  return false;
}

/** Lower/adjacent sector whose ceiling quads cover courtyard sky through a hangar opening. */
export function isHangarLipSectorOccludingOutdoorSky(
  map: WadMap,
  sectorIndex: number,
  cameraSectorIndex: number,
): boolean {
  if (sectorIndex === cameraSectorIndex) return false;
  const cameraSector = cameraSectorIndex >= 0 ? map.SECTORS[cameraSectorIndex] : null;
  const sector = map.SECTORS[sectorIndex];
  if (!cameraSector || !sector) return false;
  return (
    sector.ceilingheight > cameraSector.ceilingheight &&
    sector.floorheight <= cameraSector.floorheight
  );
}

/** Stricter lip test for wall suppression (hex lip rooms 27/28 — not outer shell 32 or co-planar 24). */
export function isHangarLipWallSectorOccludingOutdoorSky(
  map: WadMap,
  sectorIndex: number,
  cameraSectorIndex: number,
): boolean {
  if (sectorIndex === cameraSectorIndex) return false;
  const cameraSector = cameraSectorIndex >= 0 ? map.SECTORS[cameraSectorIndex] : null;
  const sector = map.SECTORS[sectorIndex];
  if (!cameraSector || !sector) return false;
  return (
    sector.floorheight < cameraSector.floorheight &&
    sector.ceilingheight > cameraSector.ceilingheight &&
    (normalizeFlatName(sector.floorpic) === 'FLAT14' ||
      sector.ceilingheight <= cameraSector.ceilingheight + 48)
  );
}

export function shouldSuppressLipSectorForOutdoorSky(
  map: WadMap,
  sectorIndex: number,
  cameraSectorIndex: number,
  skyVisibilitySectors: ReadonlySet<number> | null,
  visibleFlatSectors: ReadonlySet<number> | null,
): boolean {
  if (!hasOutdoorSkyThroughOpening(map, skyVisibilitySectors, visibleFlatSectors)) {
    return false;
  }
  return isHangarLipSectorOccludingOutdoorSky(map, sectorIndex, cameraSectorIndex);
}

export function shouldSuppressLipWallForOutdoorSky(
  map: WadMap,
  sectorIndex: number,
  cameraSectorIndex: number,
  skyVisibilitySectors: ReadonlySet<number> | null,
  visibleFlatSectors: ReadonlySet<number> | null,
): boolean {
  if (!hasOutdoorSkyThroughOpening(map, skyVisibilitySectors, visibleFlatSectors)) {
    return false;
  }
  return isHangarLipWallSectorOccludingOutdoorSky(map, sectorIndex, cameraSectorIndex);
}

/**
 * Skip tall lip-sector ceiling flats that BSP visits through a hangar/window opening.
 * GZDoom leaves the skybox visible there (sky walls), not full ceiling quads from
 * lower adjacent sectors — e.g. E1M1 spawn sectors 27/28 over courtyard sky 42.
 */
export function shouldSkipCeilingFlatForOutdoorSky(
  map: WadMap,
  flat: { sectorIndex: number; sector: Sector; flatName: string },
  cameraSectorIndex: number,
  skyVisibilitySectors: ReadonlySet<number> | null,
  visibleFlatSectors: ReadonlySet<number> | null,
  skyActive: boolean,
): boolean {
  if (!skyActive) return false;
  const isFloor =
    normalizeFlatName(flat.flatName) === normalizeFlatName(flat.sector.floorpic);
  if (isFloor) return false;
  if (
    !shouldSuppressLipSectorForOutdoorSky(
      map,
      flat.sectorIndex,
      cameraSectorIndex,
      skyVisibilitySectors,
      visibleFlatSectors,
    )
  ) {
    // Camera-sector ceiling still covers the skybox through hangar/window openings (E1M1 spawn).
    if (
      flat.sectorIndex !== cameraSectorIndex ||
      !hasOutdoorSkyThroughOpening(map, skyVisibilitySectors, visibleFlatSectors)
    ) {
      return false;
    }
  }

  return true;
}

/** Skip lip-sector floor flats that x-ray through the hangar opening (E1M1 sectors 27/28 hex at spawn). */
export function shouldSkipFloorFlatForOutdoorSky(
  map: WadMap,
  flat: { sectorIndex: number; sector: Sector; flatName: string },
  cameraSectorIndex: number,
  skyVisibilitySectors: ReadonlySet<number> | null,
  visibleFlatSectors: ReadonlySet<number> | null,
  skyActive: boolean,
): boolean {
  if (!skyActive) return false;
  const isFloor =
    normalizeFlatName(flat.flatName) === normalizeFlatName(flat.sector.floorpic);
  if (!isFloor) return false;
  if (flat.sectorIndex === cameraSectorIndex) return false;
  return shouldSuppressLipSectorForOutdoorSky(
    map,
    flat.sectorIndex,
    cameraSectorIndex,
    skyVisibilitySectors,
    visibleFlatSectors,
  );
}
