import { WadMap } from '@/wad/interfaces/WadMap';
import { Triangle } from '@/wad/interfaces/Triangle';
import { WallTexture } from '@/wad/interfaces/WallTexture';
import { getSectorLineGeometry } from '@/wad/renderer/geometry/getLineDefsBySector';
import { mapToFlats } from '@/wad/renderer/geometry/mapToFlats';
import { mapToWalls } from '@/wad/renderer/geometry/mapToWalls';
import { sectorLinesToTriangles } from '@/wad/renderer/geometry/sectorLinesToTriangles';
import { FlatObject } from '@/wad/interfaces/FlatObject';
import { WallObject } from '@/wad/interfaces/WallObject';

export interface CpuMapGeometry {
  sectorTriangles: Record<number, Triangle[]>;
  flats: FlatObject[];
  walls: WallObject[];
}

export function buildMapGeometryCpu(
  map: WadMap,
  texturesByName: Record<string, WallTexture>
): CpuMapGeometry {
  const lineDefsBySector = getSectorLineGeometry(map);

  const sectorTriangles = map.SECTORS.reduce<Record<number, Triangle[]>>((acc, _, sectorIndex) => {
    try {
      if (lineDefsBySector[sectorIndex]) {
        acc[sectorIndex] = sectorLinesToTriangles(map, lineDefsBySector[sectorIndex]);
      }
    } catch {
      // Malformed sectors are skipped like the main-thread path.
    }
    return acc;
  }, {});

  return {
    sectorTriangles,
    flats: mapToFlats(map, sectorTriangles),
    walls: mapToWalls(map, texturesByName),
  };
}
