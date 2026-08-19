import { createBuffer, createElementBuffer } from 'apl-easy-gl';

import { FRUSTUM_CULL_RADIUS } from '@/wad/constants/RenderInfo';

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
import { buildBspRenderIndex, type BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import {
  buildSortedFlats,
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  sortOpaqueWallsForDraw,
} from '@/wad/renderer/geometry/geometryCache';
import { readWallFacingNormal } from '@/wad/renderer/geometry/wallFacingNormal';
import { getLineSectorIndices } from '@/wad/renderer/utils/sectorVisibility';

export interface MapBuffers {
  sectorTriangles: Record<number, Array<Triangle>>;
  triangleHash: SectorTriangleHash | null;
  sectorVisibility: SectorVisibilityIndex | null;
  bspRenderIndex: BspRenderIndex | null;
  flats: Array<FlatBuffer>;
  subsectorFlats: Array<FlatBuffer>;
  walls: Array<WallBuffer>;
  opaqueWalls: Array<WallBuffer>;
  transparentWalls: Array<WallBuffer>;
  /** Pre-sorted draw order for flats; rebuilt when geometry changes. */
  sortedFlats: Array<FlatBuffer>;
  /** wall index ranges per linedef for partial door updates. */
  wallRangesByLine: Array<{ start: number; count: number }>;
  wallRangesByLineAndSide: Array<{
    side0: { start: number; count: number };
    side1: { start: number; count: number };
  }>;
  /** Bumped on every partial/full geometry upload so draw caches stay in sync. */
  geometryRevision: number;
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
      cpuPosition: wall.position,
      cpuUv: wall.uv,
      cpuIndices: wall.indices,
      positionBytes: wall.position.byteLength,
      uvBytes: wall.uv.byteLength,
      normalBytes: wall.normal.byteLength,
      indicesBytes: wall.indices.byteLength,
      texName: wall.texName!,
      sector,
      sectorIndex,
      lineIndex: wall.lineIndex ?? -1,
      sideDefIndex: wall.sideDefIndex ?? -1,
      transparent: Boolean(wall.transparent),
      twoSidedMiddle: Boolean(wall.twoSidedMiddle),
      repeatVertical: wall.repeatVertical !== false,
      center: wall.center,
      boundsRadius: wall.boundsRadius ?? FRUSTUM_CULL_RADIUS,
      facingNormal: readWallFacingNormal(wall),
      portalSectors: getLineSectorIndices(map, wall.lineIndex ?? -1),
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
      cpuPosition: flat.position,
      cpuUv: flat.uv,
      cpuIndices: flat.indices,
      flatName: flat.flatName,
      sector,
      sectorIndex,
      center: flat.center,
      boundsRadius: flat.boundsRadius,
    };
  });

  const bspRenderIndex = buildBspRenderIndex(map);
  const subsectorFlatObjects = bspRenderIndex ? mapToSubsectorFlats(map, bspRenderIndex) : [];
  const subsectorFlatBuffers = subsectorFlatObjects.map((flat) => {
    const sectorIndex = flat.sectorIndex;
    const sector = map.SECTORS[sectorIndex] ?? flat.sector;
    return {
      position: createBuffer(gl, flat.position, 3),
      normal: createBuffer(gl, flat.normal, 3),
      uv: createBuffer(gl, flat.uv, 2),
      indices: createElementBuffer(gl, flat.indices, 1),
      cpuPosition: flat.position,
      cpuUv: flat.uv,
      cpuIndices: flat.indices,
      flatName: flat.flatName,
      sector,
      sectorIndex,
      subsectorIndex: flat.subsectorIndex,
      center: flat.center,
      boundsRadius: flat.boundsRadius,
    };
  });

  const wallRangesByLine = buildWallRangesByLine(geometry.walls, map.LINEDEFS.length);
  const wallRangesByLineAndSide = buildWallRangesByLineAndSide(
    geometry.walls.map((wall) => ({
      lineIndex: wall.lineIndex ?? -1,
      sideDefIndex: wall.sideDefIndex ?? -1,
    })),
    map.LINEDEFS.length,
    map
  );

  return {
    sectorTriangles: geometry.sectorTriangles,
    triangleHash: null,
    sectorVisibility: null,
    bspRenderIndex,
    flats: flatBuffers,
    subsectorFlats: subsectorFlatBuffers,
    walls: wallBuffers,
    opaqueWalls: sortOpaqueWallsForDraw(wallBuffers.filter((wall) => !wall.transparent)),
    transparentWalls: wallBuffers.filter((wall) => wall.transparent),
    sortedFlats: buildSortedFlats(flatBuffers),
    wallRangesByLine,
    wallRangesByLineAndSide,
    geometryRevision: 0,
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
): Promise<{ buffers: MapBuffers; geometry: CpuMapGeometry }> {
  try {
    const geometry = await buildMapGeometryInWorker(map, texturesByName);
    return { buffers: uploadCpuGeometry(gl, map, geometry), geometry };
  } catch (error) {
    console.warn('[createMapBuffersAsync] worker path failed; using sync CPU fallback:', error);
    const geometry = buildMapGeometryCpu(map, texturesByName);
    return { buffers: uploadCpuGeometry(gl, map, geometry), geometry };
  }
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
