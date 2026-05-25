import { createBuffer, createElementBuffer } from 'apl-easy-gl';
import { WadMap } from '@/wad/interfaces/WadMap';
import { WallTexture } from '@/wad/interfaces/WallTexture';
import { WallObject } from '@/wad/interfaces/WallObject';
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
import { readWallFacingNormal } from '@/wad/renderer/geometry/wallFacingNormal';

function uploadBuffer(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  data: Float32Array,
  usage: number,
  cachedBytes: number
): number {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  if (cachedBytes > 0 && data.byteLength === cachedBytes) {
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    return cachedBytes;
  }
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  return data.byteLength;
}

function uploadIndexBuffer(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  data: Uint16Array | Uint32Array,
  usage: number,
  cachedBytes: number
): number {
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
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
  wallBuffer.facingNormal = readWallFacingNormal(wall);
}

function rebuildWallBuffers(
  gl: WebGL2RenderingContext,
  map: WadMap,
  walls: ReturnType<typeof mapToWalls>
): MapBuffers['walls'] {
  return walls.map((wall) => {
    const sectorIndex = wall.sectorIndex ?? (wall.sector ? map.SECTORS.indexOf(wall.sector) : -1);
    const sector = sectorIndex >= 0 ? map.SECTORS[sectorIndex] : wall.sector!;
    const position = createBuffer(gl, wall.position, 3);
    const uv = createBuffer(gl, wall.uv, 2);
    const normal = createBuffer(gl, wall.normal, 3);
    const indices = createElementBuffer(gl, wall.indices, 1);
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
      facingNormal: readWallFacingNormal(wall),
    };
  });
}

function refreshFlatsForSectors(
  gl: WebGL2RenderingContext,
  map: WadMap,
  buffers: MapBuffers,
  dirtySectors: ReadonlySet<number>
): void {
  const flats = mapToFlats(map, buffers.sectorTriangles);
  const dynamic = gl.DYNAMIC_DRAW;

  for (const flatIndex of getFlatIndicesForSectors(buffers.flats, dirtySectors)) {
    const flatBuffer = buffers.flats[flatIndex];
    const flat = flats[flatIndex];
    if (!flat || !flatBuffer) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, flatBuffer.position);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, flat.position);
    gl.bindBuffer(gl.ARRAY_BUFFER, flatBuffer.normal);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, flat.normal);
    flatBuffer.center = flat.center;
    flatBuffer.sector = map.SECTORS[flat.sectorIndex] ?? flatBuffer.sector;
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
}

function patchMiddleWallsOnLine(
  gl: WebGL2RenderingContext,
  map: WadMap,
  buffers: MapBuffers,
  lineIndex: number,
  newWalls: WallObject[],
  dynamic: number
): void {
  const range = buffers.wallRangesByLine[lineIndex];
  if (!range || range.start < 0) return;

  for (const newWall of newWalls) {
    if (!newWall.twoSidedMiddle) continue;
    for (let i = range.start; i < range.start + range.count; i++) {
      const wallBuffer = buffers.walls[i];
      if (wallBuffer.twoSidedMiddle && wallBuffer.lineIndex === lineIndex) {
        applyWallObject(gl, wallBuffer, newWall, map, dynamic);
        break;
      }
    }
  }
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
  let needsFullRebuild = false;

  for (const lineIndex of lineIndices) {
    const newWalls = mapToWallsForLine(map, texturesByName, lineIndex, defaultWall);
    const range = buffers.wallRangesByLine[lineIndex];
    if (!range || range.start < 0) {
      needsFullRebuild = true;
      continue;
    }

    patchMiddleWallsOnLine(gl, map, buffers, lineIndex, newWalls, dynamic);

    if (range.count !== newWalls.length) {
      needsFullRebuild = true;
      continue;
    }

    for (let i = 0; i < newWalls.length; i++) {
      applyWallObject(gl, buffers.walls[range.start + i], newWalls[i], map, dynamic);
    }
  }

  refreshFlatsForSectors(gl, map, buffers, dirtySectors);
  const lists = rebuildWallDrawLists(buffers.walls);
  buffers.opaqueWalls = lists.opaqueWalls;
  buffers.transparentWalls = lists.transparentWalls;
  return !needsFullRebuild;
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
    // Crusher-style doors (ceiling == floor when closed) can drop from upper/lower
    // walls to zero walls when fully open. Deferring a full rebuild leaves stale GPU
    // geometry that reads as a phantom tunnel until the next full pass.
    refreshFull(gl, map, texturesByName, buffers);
    return 'full';
  }

  refreshFull(gl, map, texturesByName, buffers);
  return 'full';
}
