import { skyFlats } from '@/wad/constants/WadInfo';
import type { FlatObject } from '@/wad/interfaces/FlatObject';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { createFlatMesh } from '@/wad/renderer/geometry/mapToFlats';
import { subsectorSignedArea, subsectorToTriangles } from '@/wad/renderer/geometry/subsectorToTriangles';

/** Ignore degenerate BSP slivers smaller than one flat texel. */
const MIN_SUBSECTOR_FLAT_AREA = 1;

/** Per-subsector floor/ceiling meshes — matches GZDoom `HWFlat::ProcessSector` spans. */
export function mapToSubsectorFlats(
  map: WadMap,
  index: BspRenderIndex
): FlatObject[] {
  const flats: FlatObject[] = [];

  for (let subsectorIndex = 0; subsectorIndex < index.subsectorSegs.length; subsectorIndex++) {
    const segIndices = index.subsectorSegs[subsectorIndex];
    if (!segIndices || segIndices.length < 2) continue;

    const sectorIndex = index.subsectorToSector[subsectorIndex];
    if (sectorIndex < 0) continue;

    const sector = map.SECTORS[sectorIndex];
    if (!sector || sector.ceilingheight <= sector.floorheight) continue;

    const triangles = subsectorToTriangles(map, segIndices);
    if (triangles.length === 0) continue;
    if (Math.abs(subsectorSignedArea(map, segIndices)) < MIN_SUBSECTOR_FLAT_AREA) continue;

    if (skyFlats.indexOf(sector.floorpic) < 0) {
      flats.push({
        sector,
        sectorIndex,
        subsectorIndex,
        flatName: sector.floorpic,
        ...createFlatMesh(triangles, sector.floorheight, false),
      });
    }

    if (skyFlats.indexOf(sector.ceilingpic) < 0) {
      flats.push({
        sector,
        sectorIndex,
        subsectorIndex,
        flatName: sector.ceilingpic,
        ...createFlatMesh(triangles, sector.ceilingheight, true),
      });
    }
  }

  return flats;
}
