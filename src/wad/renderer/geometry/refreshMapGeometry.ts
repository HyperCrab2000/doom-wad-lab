import { createBuffer, createElementBuffer } from 'apl-easy-gl';
import { WadMap } from '@/wad/interfaces/WadMap';
import { WallTexture } from '@/wad/interfaces/WallTexture';
import { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import {
  buildSortedFlats,
  buildWallRangesByLine,
  rebuildWallDrawLists,
} from '@/wad/renderer/geometry/geometryCache';
import { mapToFlats } from '@/wad/renderer/geometry/mapToFlats';
import { mapToWalls, mapToWallsForLine } from '@/wad/renderer/geometry/mapToWalls';
import {
  getFlatIndicesForSectors,
  getLineIndicesForSectors,
} from '@/wad/renderer/geometry/sectorLineIndex';

function uploadBuffer(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  data: Float32Array,
  usage: number
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  if (data.byteLength === gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)) {
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  } else {
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  }
}

function uploadIndexBuffer(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  data: Uint16Array | Uint32Array,
  usage: number
): void {
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  if (data.byteLength === gl.getBufferParameter(gl.ELEMENT_ARRAY_BUFFER, gl.BUFFER_SIZE)) {
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, data);
  } else {
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, usage);
  }
}

function applyWallObject(
  gl: WebGL2RenderingContext,
  wallBuffer: MapBuffers['walls'][number],
  wall: ReturnType<typeof mapToWallsForLine>[number],
  map: WadMap,
  dynamic: number
): void {
  uploadBuffer(gl, wallBuffer.position, wall.position, dynamic);
  uploadBuffer(gl, wallBuffer.uv, wall.uv, dynamic);
  uploadBuffer(gl, wallBuffer.normal, wall.normal, dynamic);
  uploadIndexBuffer(gl, wallBuffer.indices, wall.indices, dynamic);

  const sectorIndex = wall.sectorIndex ?? -1;
  wallBuffer.sector = sectorIndex >= 0 ? map.SECTORS[sectorIndex] : wall.sector!;
  wallBuffer.sectorIndex = sectorIndex;
  wallBuffer.lineIndex = wall.lineIndex ?? -1;
  wallBuffer.texName = wall.texName!;
  wallBuffer.transparent = Boolean(wall.transparent);
  wallBuffer.twoSidedMiddle = Boolean(wall.twoSidedMiddle);
  wallBuffer.repeatVertical = wall.repeatVertical !== false;
  wallBuffer.center = wall.center;
}

function rebuildWallBuffers(
  gl: WebGL2RenderingContext,
  map: WadMap,
  walls: ReturnType<typeof mapToWalls>
): MapBuffers['walls'] {
  return walls.map((wall) => {
    const sectorIndex = wall.sectorIndex ?? (wall.sector ? map.SECTORS.indexOf(wall.sector) : -1);
    const sector = sectorIndex >= 0 ? map.SECTORS[sectorIndex] : wall.sector!;
    return {
      position: createBuffer(gl, wall.position, 3),
      uv: createBuffer(gl, wall.uv, 2),
      normal: createBuffer(gl, wall.normal, 3),
      indices: createElementBuffer(gl, wall.indices, 1),
      texName: wall.texName!,
      sector,
      sectorIndex,
      lineIndex: wall.lineIndex ?? -1,
      transparent: Boolean(wall.transparent),
      twoSidedMiddle: Boolean(wall.twoSidedMiddle),
      repeatVertical: wall.repeatVertical !== false,
      center: wall.center,
    };
  });
}

function refreshFull(
  gl: WebGL2RenderingContext,
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  buffers: MapBuffers
): void {
  const flats = mapToFlats(map, buffers.sectorTriangles);
  const walls = mapToWalls(map, texturesByName);
  const dynamic = gl.DYNAMIC_DRAW;

  if (walls.length !== buffers.walls.length) {
    buffers.walls = rebuildWallBuffers(gl, map, walls);
    const lists = rebuildWallDrawLists(buffers.walls);
    buffers.opaqueWalls = lists.opaqueWalls;
    buffers.transparentWalls = lists.transparentWalls;
    buffers.wallRangesByLine = buildWallRangesByLine(walls, map.LINEDEFS.length);
  } else {
    walls.forEach((wall, index) => {
      applyWallObject(gl, buffers.walls[index], wall, map, dynamic);
    });
    const lists = rebuildWallDrawLists(buffers.walls);
    buffers.opaqueWalls = lists.opaqueWalls;
    buffers.transparentWalls = lists.transparentWalls;
  }

  buffers.flats.forEach((flatBuffer, index) => {
    const flat = flats[index];
    if (!flat) return;
    uploadBuffer(gl, flatBuffer.position, flat.position, dynamic);
    uploadBuffer(gl, flatBuffer.normal, flat.normal, dynamic);
    flatBuffer.center = flat.center;
    if (flat.sectorIndex !== undefined) {
      flatBuffer.sector = map.SECTORS[flat.sectorIndex] ?? flatBuffer.sector;
    }
  });

  buffers.sortedFlats = buildSortedFlats(buffers.flats);
}

function refreshPartial(
  gl: WebGL2RenderingContext,
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  buffers: MapBuffers,
  dirtySectors: ReadonlySet<number>
): boolean {
  const lineIndices = getLineIndicesForSectors(map, dirtySectors);
  const defaultWall = 'BLAKWAL1' in texturesByName ? 'BLAKWAL1' : Object.keys(texturesByName)[0];
  const dynamic = gl.DYNAMIC_DRAW;

  for (const lineIndex of lineIndices) {
    const newWalls = mapToWallsForLine(map, texturesByName, lineIndex, defaultWall);
    const range = buffers.wallRangesByLine[lineIndex];
    if (!range || range.start < 0 || range.count !== newWalls.length) {
      return false;
    }

    for (let i = 0; i < newWalls.length; i++) {
      applyWallObject(gl, buffers.walls[range.start + i], newWalls[i], map, dynamic);
    }
  }

  const flats = mapToFlats(map, buffers.sectorTriangles);
  for (const flatIndex of getFlatIndicesForSectors(buffers.flats, dirtySectors)) {
    const flatBuffer = buffers.flats[flatIndex];
    const flat = flats[flatIndex];
    if (!flat || !flatBuffer) continue;
    uploadBuffer(gl, flatBuffer.position, flat.position, dynamic);
    uploadBuffer(gl, flatBuffer.normal, flat.normal, dynamic);
    flatBuffer.center = flat.center;
    flatBuffer.sector = map.SECTORS[flat.sectorIndex] ?? flatBuffer.sector;
  }

  buffers.sortedFlats = buildSortedFlats(buffers.flats);
  const lists = rebuildWallDrawLists(buffers.walls);
  buffers.opaqueWalls = lists.opaqueWalls;
  buffers.transparentWalls = lists.transparentWalls;
  return true;
}

export function refreshMapGeometry(
  gl: WebGL2RenderingContext,
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  buffers: MapBuffers,
  dirtySectors?: ReadonlySet<number>
): void {
  const usePartial =
    dirtySectors &&
    dirtySectors.size > 0 &&
    dirtySectors.size <= Math.max(4, Math.floor(map.SECTORS.length * 0.15));

  if (usePartial && refreshPartial(gl, map, texturesByName, buffers, dirtySectors)) {
    return;
  }

  refreshFull(gl, map, texturesByName, buffers);
}
