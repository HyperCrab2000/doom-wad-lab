import { createBuffer, createElementBuffer, type Buffer, type ElementBuffer } from 'apl-easy-gl';

import { FRUSTUM_CULL_RADIUS } from '@/wad/constants/RenderInfo';
import { WadMap } from '@/wad/interfaces/WadMap';
import { WallTexture } from '@/wad/interfaces/WallTexture';
import { WallObject } from '@/wad/interfaces/WallObject';
import { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import {
  buildSortedFlats,
  buildWallRangesFromWallBuffers,
  rebuildWallDrawLists,
} from '@/wad/renderer/geometry/geometryCache';
import { mapToFlats } from '@/wad/renderer/geometry/mapToFlats';
import { mapToWalls, mapToWallsForLine } from '@/wad/renderer/geometry/mapToWalls';
import { getLineIndicesForSectors } from '@/wad/renderer/geometry/sectorLineIndex';
import { readWallFacingNormal } from '@/wad/renderer/geometry/wallFacingNormal';
import { getLineSectorIndices } from '@/wad/renderer/utils/sectorVisibility';

function uploadBuffer(
  gl: WebGL2RenderingContext,
  buffer: Buffer,
  data: Float32Array,
  usage: number,
  cachedBytes: number
): number {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
  if (cachedBytes > 0 && data.byteLength === cachedBytes) {
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    return cachedBytes;
  }
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  return data.byteLength;
}

function uploadIndexBuffer(
  gl: WebGL2RenderingContext,
  buffer: ElementBuffer,
  data: Uint16Array | Uint32Array,
  usage: number,
  cachedBytes: number
): number {
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer.buffer);
  if (cachedBytes > 0 && data.byteLength === cachedBytes) {
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, data);
    return cachedBytes;
  }
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, usage);
  return data.byteLength;
}

function applyWallObject(
  gl: WebGL2RenderingContext,
  wallBuffer: MapBuffers['walls'][number],
  wall: WallObject,
  map: WadMap,
  dynamic: number
): void {
  wallBuffer.positionBytes = uploadBuffer(
    gl,
    wallBuffer.position,
    wall.position,
    dynamic,
    wallBuffer.positionBytes
  );
  wallBuffer.uvBytes = uploadBuffer(gl, wallBuffer.uv, wall.uv, dynamic, wallBuffer.uvBytes);
  wallBuffer.normalBytes = uploadBuffer(
    gl,
    wallBuffer.normal,
    wall.normal,
    dynamic,
    wallBuffer.normalBytes
  );
  wallBuffer.indicesBytes = uploadIndexBuffer(
    gl,
    wallBuffer.indices,
    wall.indices,
    dynamic,
    wallBuffer.indicesBytes
  );

  const sectorIndex = wall.sectorIndex ?? -1;
  wallBuffer.sector = sectorIndex >= 0 ? map.SECTORS[sectorIndex] : wall.sector!;
  wallBuffer.sectorIndex = sectorIndex;
  wallBuffer.lineIndex = wall.lineIndex ?? -1;
  wallBuffer.texName = wall.texName!;
  wallBuffer.transparent = Boolean(wall.transparent);
  wallBuffer.twoSidedMiddle = Boolean(wall.twoSidedMiddle);
  wallBuffer.repeatVertical = wall.repeatVertical !== false;
  wallBuffer.center = wall.center;
  wallBuffer.boundsRadius = wall.boundsRadius ?? FRUSTUM_CULL_RADIUS;
  wallBuffer.facingNormal = readWallFacingNormal(wall);
  wallBuffer.portalSectors = getLineSectorIndices(map, wall.lineIndex ?? -1);
}

function createWallBufferFromObject(
  gl: WebGL2RenderingContext,
  wall: WallObject,
  map: WadMap,
  dynamic: number
): MapBuffers['walls'][number] {
  const sectorIndex = wall.sectorIndex ?? -1;
  const sector = sectorIndex >= 0 ? map.SECTORS[sectorIndex] : wall.sector!;
  const position = createBuffer(gl, wall.position, 3);
  const uv = createBuffer(gl, wall.uv, 2);
  const normal = createBuffer(gl, wall.normal, 3);
  const indices = createElementBuffer(gl, wall.indices, 1);
  gl.bindBuffer(gl.ARRAY_BUFFER, position.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, wall.position, dynamic);
  gl.bindBuffer(gl.ARRAY_BUFFER, uv.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, wall.uv, dynamic);
  gl.bindBuffer(gl.ARRAY_BUFFER, normal.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, wall.normal, dynamic);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices.buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wall.indices, dynamic);

  return {
    position,
    uv,
    normal,
    indices,
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
    boundsRadius: wall.boundsRadius ?? FRUSTUM_CULL_RADIUS,
    facingNormal: readWallFacingNormal(wall),
    portalSectors: getLineSectorIndices(map, wall.lineIndex ?? -1),
  };
}

function rebuildWallRanges(buffers: MapBuffers, lineCount: number): void {
  buffers.wallRangesByLine = buildWallRangesFromWallBuffers(buffers.walls, lineCount);
}

function replaceLineWalls(
  gl: WebGL2RenderingContext,
  map: WadMap,
  buffers: MapBuffers,
  lineIndex: number,
  newWalls: WallObject[],
  dynamic: number
): 'updated' | 'spliced' | 'missing-range' | 'empty' {
  const range = buffers.wallRangesByLine[lineIndex];
  if (!range || range.start < 0) {
    return newWalls.length === 0 ? 'empty' : 'missing-range';
  }

  if (newWalls.length === 0) {
    for (let i = range.start; i < range.start + range.count; i++) {
      deleteWallBuffer(gl, buffers.walls[i]);
    }
    buffers.walls.splice(range.start, range.count);
    rebuildWallRanges(buffers, map.LINEDEFS.length);
    return 'spliced';
  }

  if (range.count === newWalls.length) {
    for (let i = 0; i < newWalls.length; i++) {
      applyWallObject(gl, buffers.walls[range.start + i], newWalls[i], map, dynamic);
    }
    return 'updated';
  }

  for (let i = range.start; i < range.start + range.count; i++) {
    deleteWallBuffer(gl, buffers.walls[i]);
  }
  const replacement = newWalls.map((wall) => createWallBufferFromObject(gl, wall, map, dynamic));
  buffers.walls.splice(range.start, range.count, ...replacement);
  rebuildWallRanges(buffers, map.LINEDEFS.length);
  return 'spliced';
}

function deleteWallBuffer(gl: WebGL2RenderingContext, wall: MapBuffers['walls'][number]): void {
  gl.deleteBuffer(wall.position);
  gl.deleteBuffer(wall.uv);
  gl.deleteBuffer(wall.normal);
  gl.deleteBuffer(wall.indices);
}

function rebuildWallBuffers(
  gl: WebGL2RenderingContext,
  map: WadMap,
  walls: ReturnType<typeof mapToWalls>,
  dynamic: number
): MapBuffers['walls'] {
  return walls.map((wall) => createWallBufferFromObject(gl, wall, map, dynamic));
}

function createFlatBufferFromObject(
  gl: WebGL2RenderingContext,
  flat: ReturnType<typeof mapToFlats>[number],
  map: WadMap
): MapBuffers['flats'][number] {
  const sector = map.SECTORS[flat.sectorIndex] ?? flat.sector;
  const position = createBuffer(gl, flat.position, 3);
  const normal = createBuffer(gl, flat.normal, 3);
  const uv = createBuffer(gl, flat.uv, 2);
  const indices = createElementBuffer(gl, flat.indices, 1);
  gl.bindBuffer(gl.ARRAY_BUFFER, position.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, flat.position, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, normal.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, flat.normal, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, uv.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, flat.uv, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices.buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, flat.indices, gl.DYNAMIC_DRAW);

  return {
    position,
    normal,
    uv,
    indices,
    flatName: flat.flatName,
    sector,
    sectorIndex: flat.sectorIndex,
    center: flat.center,
    boundsRadius: flat.boundsRadius,
  };
}

/** Rebuild flat GPU buffers for dirty sectors (handles doors opening from zero height). */
function syncFlatsForDirtySectors(
  gl: WebGL2RenderingContext,
  map: WadMap,
  buffers: MapBuffers,
  dirtySectors: ReadonlySet<number>
): void {
  const dirty = new Set(dirtySectors);
  const allFlats = mapToFlats(map, buffers.sectorTriangles);

  buffers.flats = buffers.flats.filter((flat) => !dirty.has(flat.sectorIndex));

  for (const flat of allFlats) {
    if (dirty.has(flat.sectorIndex)) {
      buffers.flats.push(createFlatBufferFromObject(gl, flat, map));
    }
  }

  buffers.sortedFlats = buildSortedFlats(buffers.flats);
}

function refreshFull(
  gl: WebGL2RenderingContext,
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  buffers: MapBuffers
): void {
  const walls = mapToWalls(map, texturesByName);
  const dynamic = gl.DYNAMIC_DRAW;

  if (walls.length !== buffers.walls.length) {
    buffers.walls = rebuildWallBuffers(gl, map, walls, dynamic);
  } else {
    walls.forEach((wall, index) => {
      applyWallObject(gl, buffers.walls[index], wall, map, dynamic);
    });
  }

  rebuildWallRanges(buffers, map.LINEDEFS.length);
  const lists = rebuildWallDrawLists(buffers.walls);
  buffers.opaqueWalls = lists.opaqueWalls;
  buffers.transparentWalls = lists.transparentWalls;
}

function refreshPartial(
  gl: WebGL2RenderingContext,
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  buffers: MapBuffers,
  dirtySectors: ReadonlySet<number>,
  options: { includeFlats?: boolean; extraLineIndices?: ReadonlySet<number> } = {}
): boolean {
  const lineIndices = getLineIndicesForSectors(map, dirtySectors);
  if (options.extraLineIndices) {
    for (const lineIndex of options.extraLineIndices) {
      lineIndices.add(lineIndex);
    }
  }
  const defaultWall = 'BLAKWAL1' in texturesByName ? 'BLAKWAL1' : Object.keys(texturesByName)[0];
  const dynamic = gl.DYNAMIC_DRAW;
  let missingRange = false;

  for (const lineIndex of lineIndices) {
    const newWalls = mapToWallsForLine(map, texturesByName, lineIndex, defaultWall);
    const result = replaceLineWalls(gl, map, buffers, lineIndex, newWalls, dynamic);
    if (result === 'missing-range') {
      missingRange = true;
    }
  }

  if (options.includeFlats !== false) {
    syncFlatsForDirtySectors(gl, map, buffers, dirtySectors);
  }

  const lists = rebuildWallDrawLists(buffers.walls);
  buffers.opaqueWalls = lists.opaqueWalls;
  buffers.transparentWalls = lists.transparentWalls;
  return !missingRange;
}

/** Fast path for animated doors: update wall meshes only (no flat rebuild). */
export function refreshDoorWallGeometry(
  gl: WebGL2RenderingContext,
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  buffers: MapBuffers,
  dirtySectors: ReadonlySet<number>,
  extraLineIndices?: ReadonlySet<number>
): GeometryRefreshResult {
  const partialOk = refreshPartial(gl, map, texturesByName, buffers, dirtySectors, {
    includeFlats: true,
    extraLineIndices,
  });
  if (partialOk) {
    return 'partial';
  }
  refreshFull(gl, map, texturesByName, buffers);
  return 'full';
}

export type GeometryRefreshResult = 'partial' | 'full';

export function refreshMapGeometry(
  gl: WebGL2RenderingContext,
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  buffers: MapBuffers,
  dirtySectors?: ReadonlySet<number>
): GeometryRefreshResult {
  const usePartial =
    dirtySectors &&
    dirtySectors.size > 0 &&
    dirtySectors.size <= Math.max(8, Math.floor(map.SECTORS.length * 0.2));

  if (usePartial) {
    if (refreshPartial(gl, map, texturesByName, buffers, dirtySectors)) {
      return 'partial';
    }
    refreshFull(gl, map, texturesByName, buffers);
    return 'full';
  }

  refreshFull(gl, map, texturesByName, buffers);
  return 'full';
}
