import type { WadMap } from '@/wad/interfaces/WadMap';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import type { FlatBuffer } from '@/wad/interfaces/FlatBuffer';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import {
  buildFlatsBySector,
  buildFlatsBySubsector,
} from '@/wad/renderer/bsp/gzdoomDrawState';
import { wallSliceForEntry } from '@/wad/renderer/gzdoom/gzdoomRenderer';
import type { FramesByThingNameMap } from '@/wad/renderer/renderGame/types';
import type { RenderableThing } from '@/wad/renderer/renderGame/renderableThings';
import type { VoxelThingFrameMap } from '@/wad/renderer/renderGame/voxelThingMeshes';
import { appendVoxelTriangles } from './buildVoxelTriangles';
import { appendSpriteTriangles } from './buildSpriteTriangles';
import { MAX_TRACE_TRIANGLES, SURFACE_FLAT_CEILING, SURFACE_FLAT_FLOOR, SURFACE_WALL } from './pathTraceConstants';
import { normalizeFlatName } from '@/wad/renderer/renderGame/sectorLighting';

export interface SceneTriangle {
  /** World-space corners (Doom Y-up). */
  v0: [number, number, number];
  v1: [number, number, number];
  v2: [number, number, number];
  uv0: [number, number];
  uv1: [number, number];
  uv2: [number, number];
  sectorIndex: number;
  texName: string;
  /** 0 = wall, 1 = flat, 2 = sprite */
  surfaceKind: number;
  /** Midtextures / masked walls: discard low-alpha texels when tracing. */
  alphaClip?: boolean;
  lineIndex?: number;
  sideDefIndex?: number;
  subsectorIndex?: number;
}

export interface SceneTriangleBuildOptions {
  cameraPos?: [number, number, number];
  modelViewProjMatrix?: Float32Array | number[];
  renderableThings?: readonly RenderableThing[];
  sortedFramesByThingName?: FramesByThingNameMap;
  animateSpriteIndex?: number;
  voxelThingFrames?: VoxelThingFrameMap;
  timeSeconds?: number;
  /** Filled with per-triangle palette entries (voxels). */
  extraPalette?: Map<string, [number, number, number]>;
}

function pushWallTriangles(
  out: SceneTriangle[],
  position: Float32Array,
  uv: Float32Array,
  indices: Uint16Array,
  sectorIndex: number,
  texName: string,
  alphaClip = false,
  lineIndex?: number,
  sideDefIndex?: number
): void {
  for (let i = 0; i < indices.length; i += 3) {
    if (out.length >= MAX_TRACE_TRIANGLES) return;
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;
    const u0 = indices[i] * 2;
    const u1 = indices[i + 1] * 2;
    const u2 = indices[i + 2] * 2;
    out.push({
      v0: [position[i0], position[i0 + 1], position[i0 + 2]],
      v1: [position[i1], position[i1 + 1], position[i1 + 2]],
      v2: [position[i2], position[i2 + 1], position[i2 + 2]],
      uv0: [uv[u0], uv[u0 + 1]],
      uv1: [uv[u1], uv[u1 + 1]],
      uv2: [uv[u2], uv[u2 + 1]],
      sectorIndex,
      texName,
      surfaceKind: SURFACE_WALL,
      alphaClip,
      lineIndex,
      sideDefIndex,
    });
  }
}

function flatSurfaceKind(flat: FlatBuffer): number {
  if (!flat.sector?.floorpic) {
    return SURFACE_FLAT_FLOOR;
  }
  return normalizeFlatName(flat.flatName) === normalizeFlatName(flat.sector.floorpic)
    ? SURFACE_FLAT_FLOOR
    : SURFACE_FLAT_CEILING;
}

function pushFlatBufferTriangles(out: SceneTriangle[], flat: FlatBuffer): void {
  const kind = flatSurfaceKind(flat);
  pushFlatTriangles(
    out,
    flat.cpuPosition,
    flat.cpuUv,
    flat.cpuIndices,
    flat.sectorIndex,
    flat.flatName,
    kind,
    flat.subsectorIndex
  );
}

function pushFlatTriangles(
  out: SceneTriangle[],
  position: Float32Array,
  uv: Float32Array,
  indices: Uint16Array,
  sectorIndex: number,
  texName: string,
  surfaceKind: number,
  subsectorIndex?: number
): void {
  const start = out.length;
  pushWallTriangles(out, position, uv, indices, sectorIndex, texName);
  for (let i = start; i < out.length; i++) {
    out[i].surfaceKind = surfaceKind;
    if (subsectorIndex !== undefined) {
      out[i].subsectorIndex = subsectorIndex;
    }
  }
}

function pushSubsectorFlats(
  out: SceneTriangle[],
  drawState: GzdoomDrawState,
  subsectorFlats: MapBuffers['subsectorFlats']
): boolean {
  if (subsectorFlats.length === 0) return false;
  const bySubsector = buildFlatsBySubsector(subsectorFlats);
  const pushed = new Set<number>();

  if (drawState.cameraSubsector >= 0) {
    pushFlatBufferList(out, bySubsector.get(drawState.cameraSubsector));
    pushed.add(drawState.cameraSubsector);
    if (out.length >= MAX_TRACE_TRIANGLES) return true;
  }

  for (const subsectorIndex of drawState.flatSubsectorOrder) {
    if (pushed.has(subsectorIndex)) continue;
    pushFlatBufferList(out, bySubsector.get(subsectorIndex));
    pushed.add(subsectorIndex);
    if (out.length >= MAX_TRACE_TRIANGLES) return true;
  }
  return true;
}

function pushFlatBufferList(
  out: SceneTriangle[],
  flats: FlatBuffer[] | undefined
): void {
  if (!flats) return;
  for (const flat of flats) {
    pushFlatBufferTriangles(out, flat);
    if (out.length >= MAX_TRACE_TRIANGLES) return;
  }
}

function pushSectorFlats(
  out: SceneTriangle[],
  flats: FlatBuffer[] | undefined
): void {
  pushFlatBufferList(out, flats);
}

function pushSectorFlatsFallback(
  out: SceneTriangle[],
  drawState: GzdoomDrawState,
  flatsBySector: Map<number, MapBuffers['flats']>
): void {
  const pushedSectors = new Set<number>();

  if (drawState.cameraSectorIndex >= 0) {
    pushSectorFlats(out, flatsBySector.get(drawState.cameraSectorIndex));
    pushedSectors.add(drawState.cameraSectorIndex);
    if (out.length >= MAX_TRACE_TRIANGLES) return;
  }

  for (const sectorIndex of drawState.flatSectorOrder) {
    if (pushedSectors.has(sectorIndex)) continue;
    pushSectorFlats(out, flatsBySector.get(sectorIndex));
    pushedSectors.add(sectorIndex);
    if (out.length >= MAX_TRACE_TRIANGLES) return;
  }
}

/** GZDoom-style: BSP subsector flats (no sector duplicate), walls, sprites. */
export function buildSceneTriangles(
  map: WadMap,
  buffers: MapBuffers,
  drawState: GzdoomDrawState,
  options: SceneTriangleBuildOptions = {}
): SceneTriangle[] {
  const out: SceneTriangle[] = [];

  if (!pushSubsectorFlats(out, drawState, buffers.subsectorFlats)) {
    const flatsBySector = buildFlatsBySector(buffers.flats);
    pushSectorFlatsFallback(out, drawState, flatsBySector);
    if (out.length >= MAX_TRACE_TRIANGLES) return out;
  } else if (out.length >= MAX_TRACE_TRIANGLES) {
    return out;
  }

  for (const entry of drawState.wallDrawOrder) {
    const range = wallSliceForEntry(buffers, map, entry.lineIndex, entry.sideDefIndex);
    if (!range || range.start < 0 || range.count <= 0) continue;

    for (let wi = range.start; wi < range.start + range.count; wi++) {
      const wall = buffers.walls[wi];
      if (!wall) continue;
      pushWallTriangles(
        out,
        wall.cpuPosition,
        wall.cpuUv,
        wall.cpuIndices,
        wall.sectorIndex,
        wall.texName,
        Boolean(wall.transparent),
        wall.lineIndex,
        wall.sideDefIndex
      );
      if (out.length >= MAX_TRACE_TRIANGLES) return out;
    }
  }

  if (
    options.cameraPos &&
    options.modelViewProjMatrix &&
    options.renderableThings &&
    options.sortedFramesByThingName
  ) {
    appendSpriteTriangles(
      out,
      options.renderableThings,
      options.sortedFramesByThingName,
      options.animateSpriteIndex ?? 0,
      options.cameraPos,
      options.modelViewProjMatrix,
      drawState.visibleSectors
    );
  }

  if (
    options.cameraPos &&
    options.modelViewProjMatrix &&
    options.renderableThings &&
    options.voxelThingFrames &&
    options.extraPalette
  ) {
    appendVoxelTriangles(
      out,
      options.renderableThings,
      options.voxelThingFrames,
      options.animateSpriteIndex ?? 0,
      options.timeSeconds ?? 0,
      drawState.visibleSectors,
      options.extraPalette
    );
  }

  return out;
}

export { MAX_TRACE_TRIANGLES };
