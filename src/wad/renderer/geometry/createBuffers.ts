import { createBuffer, createElementBuffer } from 'apl-easy-gl';

import type { FlatBuffer } from '@/wad/interfaces/FlatBuffer';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { ThingBuffer } from '@/wad/interfaces/ThingBuffer';
import type { Triangle } from '@/wad/interfaces/Triangle';
import type { WallBuffer } from '@/wad/interfaces/WallBuffer';
import type { WallTexture } from '@/wad/interfaces/WallTexture';

import { createThing } from '@/wad/renderer/geometry/createThing';
import { buildMapGeometryCpu, CpuMapGeometry } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import { SectorTriangleHash } from '@/wad/renderer/utils/sectorLookup';
import { SectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { buildMapGeometryInWorker } from '@/wad/renderer/workers/geometryWorkerClient';
import { buildSortedFlats, buildWallRangesByLine } from '@/wad/renderer/geometry/geometryCache';
import { readWallFacingNormal } from '@/wad/renderer/geometry/wallFacingNormal';

export interface MapBuffers {
  sectorTriangles: Record<number, Array<Triangle>>;
  triangleHash: SectorTriangleHash | null;
  sectorVisibility: SectorVisibilityIndex | null;
  flats: Array<FlatBuffer>;
  walls: Array<WallBuffer>;
  opaqueWalls: Array<WallBuffer>;
  transparentWalls: Array<WallBuffer>;
  /** Pre-sorted draw order for flats; rebuilt when geometry changes. */
  sortedFlats: Array<FlatBuffer>;
  /** wall index ranges per linedef for partial door updates. */
  wallRangesByLine: Array<{ start: number; count: number }>;
  thing: ThingBuffer;
}

function uploadCpuGeometry(
  gl: WebGLRenderingContext,
  map: WadMap,
  geometry: CpuMapGeometry
): MapBuffers {
  const wallBuffers = geometry.walls.map((wall) => {
    const sectorIndex = wall.sectorIndex ?? -1;
    const sector = sectorIndex >= 0 ? map.SECTORS[sectorIndex] : wall.sector!;
    return {
      position: createBuffer(gl, wall.position, 3),
      uv: createBuffer(gl, wall.uv, 2),
      normal: createBuffer(gl, wall.normal, 3),
      indices: createElementBuffer(gl, wall.indices, 1),
      positionBytes: wall.position.byteLength,
      uvBytes: wall.uv.byteLength,
      normalBytes: wall.normal.byteLength,
      indicesBytes: wall.indices.byteLength,
      texName: wall.texName!,
      sector,
      sectorIndex,
      lineIndex: wall.lineIndex ?? -1,
      transparent: Boolean(wall.transparent),
      twoSidedMiddle: Boolean(wall.twoSidedMiddle),
      repeatVertical: wall.repeatVertical !== false,
      center: wall.center,
      facingNormal: readWallFacingNormal(wall),
    };
  });

  const flatBuffers = geometry.flats.map((flat) => {
    const sectorIndex = flat.sectorIndex;
    const sector = map.SECTORS[sectorIndex] ?? flat.sector;
    return {
      position: createBuffer(gl, flat.position, 3),
      normal: createBuffer(gl, flat.normal, 3),
      uv: createBuffer(gl, flat.uv, 2),
      indices: createElementBuffer(gl, flat.indices, 1),
      flatName: flat.flatName,
      sector,
      sectorIndex,
      center: flat.center,
    };
  });

  return {
    sectorTriangles: geometry.sectorTriangles,
    triangleHash: null,
    sectorVisibility: null,
    flats: flatBuffers,
    walls: wallBuffers,
    opaqueWalls: wallBuffers.filter((wall) => !wall.transparent),
    transparentWalls: wallBuffers.filter((wall) => wall.transparent),
    sortedFlats: buildSortedFlats(flatBuffers),
    wallRangesByLine: buildWallRangesByLine(geometry.walls, map.LINEDEFS.length),
    thing: createThing(gl),
  };
}

export const createMapBuffers = (
  gl: WebGLRenderingContext,
  map: WadMap,
  texturesByName: Record<string, WallTexture>
): MapBuffers => {
  const geometry = buildMapGeometryCpu(map, texturesByName);
  return uploadCpuGeometry(gl, map, geometry);
};

export async function createMapBuffersAsync(
  gl: WebGLRenderingContext,
  map: WadMap,
  texturesByName: Record<string, WallTexture>
): Promise<MapBuffers> {
  const geometry = await buildMapGeometryInWorker(map, texturesByName);
  return uploadCpuGeometry(gl, map, geometry);
}

export function attachMapBufferIndexes(
  buffers: MapBuffers,
  triangleHash: SectorTriangleHash,
  sectorVisibility: SectorVisibilityIndex | null
): MapBuffers {
  buffers.triangleHash = triangleHash;
  buffers.sectorVisibility = sectorVisibility;
  return buffers;
}

export { uploadCpuGeometry };
