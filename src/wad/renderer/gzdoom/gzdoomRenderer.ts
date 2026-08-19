/**
 * WebGL mesh renderer — map data is authoritative; BSP only selects draw sets.
 *
 * - Map load: `mapToWalls` / `mapToFlats` bake full sector geometry from linedefs.
 * - Each frame: BSP (`buildBspVisibleSet`) returns visible linedefs + sectors.
 * - Draw: every pre-baked wall band on each visible line; sector floor/ceiling flats.
 *
 * This deliberately does NOT re-run GZDoom HWWall::Process per seg at draw time.
 * The 3D bugs were sidedef filtering, subsector flat gaps, and backface culling —
 * not the WAD or BSP traversal.
 */

import type { ShaderProgram } from 'apl-easy-gl';
import type { mat4 } from 'gl-matrix';

import type { Wad } from '@/wad/interfaces/Wad';
import type { WadMap } from '@/wad/interfaces/WadMap';
import { skyFlats } from '@/wad/constants/WadInfo';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import type { WadAssets } from '@/wad/renderer/drawAssets/drawWadAssets';
import type { WallDrawEntry } from '@/wad/renderer/bsp/bspVisibility';
import type { WallRangeSlice } from '@/wad/renderer/geometry/geometryCache';
import {
  buildFlatsBySector,
  buildFlatsBySubsector,
  buildGzdoomDrawState,
  type GzdoomDrawState,
} from '@/wad/renderer/bsp/gzdoomDrawState';

export interface GzdoomWallDrawContext {
  gl: WebGL2RenderingContext;
  wallShader: ShaderProgram;
  modelViewProjMatrix: mat4;
  cameraPos: [number, number, number];
  map: WadMap;
  textures: {
    walls: Record<string, WebGLTexture>;
    heightWalls: Record<string, WebGLTexture>;
    heightFallback: WebGLTexture;
    heightWallLoaded: ReadonlySet<string>;
    reliefWalls: ReadonlySet<string>;
  };
  wad: Wad;
  wadAssets: WadAssets;
  buffers: MapBuffers;
  animateWallIndex: number;
  timeSeconds: number;
  drawWall: (wall: MapBuffers['walls'][number]) => void;
}

export interface GzdoomFlatDrawContext {
  flatShader: ShaderProgram;
  modelViewProjMatrix: mat4;
  textures: {
    flats: Record<string, WebGLTexture>;
    heightFlats: Record<string, WebGLTexture>;
    heightFallback: WebGLTexture;
    heightFlatLoaded: ReadonlySet<string>;
    reliefFlats: ReadonlySet<string>;
  };
  wad: Wad;
  animateFlatIndex: number;
  timeSeconds: number;
  cameraPos: [number, number, number];
  liquidWake?: { x: number; z: number; strength: number; ageSeconds: number } | null;
  drawFlat: (
    flat: MapBuffers['flats'][number],
    batch: { batchKey: string; lightKey: string }
  ) => void;
}

let cachedMap: WadMap | null = null;
let cachedGeometryRevision = -1;
let cachedFlatsBySector: Map<number, MapBuffers['flats']> | null = null;
let cachedFlatsBySubsector: Map<number, MapBuffers['subsectorFlats']> | null = null;

export function invalidateGzdoomRendererCaches(): void {
  cachedMap = null;
  cachedGeometryRevision = -1;
  cachedFlatsBySector = null;
  cachedFlatsBySubsector = null;
}

function syncFlatDrawCaches(buffers: MapBuffers): void {
  const revision = buffers.geometryRevision ?? 0;
  if (revision === cachedGeometryRevision && cachedFlatsBySector && cachedFlatsBySubsector) {
    return;
  }
  cachedGeometryRevision = revision;
  cachedFlatsBySector = buildFlatsBySector(buffers.flats);
  cachedFlatsBySubsector =
    buffers.subsectorFlats.length > 0
      ? buildFlatsBySubsector(buffers.subsectorFlats)
      : null;
}

export function buildFrameDrawState(
  map: WadMap,
  buffers: MapBuffers,
  viewX: number,
  viewY: number,
  viewYaw: number,
  cameraPos: [number, number, number]
): GzdoomDrawState | null {
  if (map !== cachedMap) {
    cachedMap = map;
    cachedGeometryRevision = -1;
  }

  syncFlatDrawCaches(buffers);

  return buildGzdoomDrawState({
    map,
    buffers,
    viewX,
    viewY,
    viewYaw,
    cameraPos,
  });
}

/** Draw BSP-visible floors/ceilings — subsector pieces match GZDoom DoSubsector / HWFlat::ProcessSector. */
export function renderGzdoomFlats(
  drawState: GzdoomDrawState,
  buffers: MapBuffers,
  ctx: GzdoomFlatDrawContext
): void {
  const batch = { batchKey: '', lightKey: '' };
  syncFlatDrawCaches(buffers);
  const flatsBySector = cachedFlatsBySector!;

  if (drawState.flatDrawMode === 'subsector-bsp' && buffers.subsectorFlats.length > 0) {
    // Draw broad sector fallback first. BSP subsector flats below are authoritative and
    // overwrite same/near pixels, while this pass only fills triangulation cracks.
    const supplementedSectors = new Set<number>();
    const supplementOrder = drawState.flatSupplementSectorOrder ?? drawState.flatSectorOrder;
    for (const sectorIndex of supplementOrder) {
      if (sectorIndex < 0 || supplementedSectors.has(sectorIndex)) continue;
      const sectorFlats = flatsBySector.get(sectorIndex);
      if (!sectorFlats) continue;
      supplementedSectors.add(sectorIndex);
      for (const flat of sectorFlats) {
        if (skyFlats.includes(flat.flatName)) continue;
        const isFloor = flat.flatName === flat.sector.floorpic;
        const isCeiling = flat.flatName === flat.sector.ceilingpic;
        if (!isFloor && !isCeiling) continue;
        if (sectorIndex !== drawState.cameraSectorIndex) continue;
        if (isFloor && !flatContainsDoomPoint(flat, ctx.cameraPos[0], -ctx.cameraPos[2])) continue;
        ctx.drawFlat(flat, batch);
      }
    }
    const flatsBySubsector = cachedFlatsBySubsector;
    if (!flatsBySubsector) return;
    for (const subsectorIndex of drawState.flatSubsectorOrder) {
      const subsectorFlats = flatsBySubsector.get(subsectorIndex);
      if (!subsectorFlats) continue;
      for (const flat of subsectorFlats) {
        ctx.drawFlat(flat, batch);
      }
    }
  } else {
    for (const sectorIndex of drawState.flatSectorOrder) {
      const sectorFlats = flatsBySector.get(sectorIndex);
      if (!sectorFlats) continue;
      for (const flat of sectorFlats) {
        ctx.drawFlat(flat, batch);
      }
    }
  }

  if (drawState.flatDrawMode !== 'subsector-bsp' && buffers.subsectorFlats.length > 0) {
    const flatsBySubsector = cachedFlatsBySubsector;
    if (!flatsBySubsector) return;
    for (const subsectorIndex of drawState.flatSubsectorOrder) {
      const subsectorFlats = flatsBySubsector.get(subsectorIndex);
      if (!subsectorFlats) continue;
      for (const flat of subsectorFlats) {
        ctx.drawFlat(flat, batch);
      }
    }
  }
}

function flatContainsDoomPoint(
  flat: MapBuffers['flats'][number],
  x: number,
  y: number
): boolean {
  for (let i = 0; i < flat.cpuIndices.length; i += 3) {
    let sign = 0;
    let inside = true;
    for (let edge = 0; edge < 3; edge++) {
      const ia = flat.cpuIndices[i + edge] * 3;
      const ib = flat.cpuIndices[i + ((edge + 1) % 3)] * 3;
      const ax = flat.cpuPosition[ia]!;
      const ay = -flat.cpuPosition[ia + 2]!;
      const bx = flat.cpuPosition[ib]!;
      const by = -flat.cpuPosition[ib + 2]!;
      const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (Math.abs(cross) < 1e-5) continue;
      const nextSign = Math.sign(cross);
      if (sign === 0) sign = nextSign;
      else if (nextSign !== sign) {
        inside = false;
        break;
      }
    }
    if (inside) return true;
  }
  return false;
}

export function wallSliceForEntry(
  buffers: MapBuffers,
  map: WadMap,
  lineIndex: number,
  sideDefIndex: number
): WallRangeSlice | null {
  const bySide = buffers.wallRangesByLineAndSide[lineIndex];
  if (bySide) {
    const line = map.LINEDEFS[lineIndex];
    if (line?.sidenum) {
      const useSide1 = line.sidenum[1]! >= 0 && sideDefIndex === line.sidenum[1];
      const slice = useSide1 ? bySide.side1 : bySide.side0;
      if (slice.start >= 0 && slice.count > 0) return slice;
    }
    // The line is known to wallRangesByLineAndSide but the requested side has
    // no geometry (all textures were '-' after the phantom-wall removal).
    // Do NOT fall through to the other side's geometry — drawing front-side bands
    // from the back orientation renders them dark (inverted normals) and looks
    // like missing-texture black patches.
    return null;
  }

  const fallback = buffers.wallRangesByLine[lineIndex];
  if (!fallback || fallback.start < 0 || fallback.count <= 0) return null;
  return fallback;
}

function drawBandsOnLine(
  buffers: MapBuffers,
  map: WadMap,
  lineIndex: number,
  sideDefIndex: number,
  predicate: (wall: MapBuffers['walls'][number]) => boolean,
  drawWall: (wall: MapBuffers['walls'][number]) => void
): void {
  const range = wallSliceForEntry(buffers, map, lineIndex, sideDefIndex);
  if (!range || range.start < 0 || range.count <= 0) return;

  for (let wi = range.start; wi < range.start + range.count; wi++) {
    const wall = buffers.walls[wi];
    if (!wall) continue;
    if (!predicate(wall)) continue;
    drawWall(wall);
  }
}

/** One-sided midtextures (LITE3 windows) — alpha-tested in the opaque pass. */
function isMaskedMidWall(wall: MapBuffers['walls'][number]): boolean {
  return Boolean(wall.transparent && !wall.twoSidedMiddle);
}

/** Draw every pre-baked wall band on each BSP-visible linedef. */
export function renderGzdoomOpaqueWalls(
  drawState: GzdoomDrawState,
  buffers: MapBuffers,
  ctx: GzdoomWallDrawContext
): void {
  ctx.gl.disable(ctx.gl.CULL_FACE);
  ctx.gl.disable(ctx.gl.BLEND);
  ctx.gl.depthMask(true);
  ctx.wallShader.setUniforms({
    modelViewProj: ctx.modelViewProjMatrix,
    uCameraPos: ctx.cameraPos,
  });

  for (const entry of drawState.wallDrawOrder) {
    drawBandsOnLine(buffers, ctx.map, entry.lineIndex, entry.sideDefIndex, (wall) => !wall.transparent, ctx.drawWall);
    drawBandsOnLine(buffers, ctx.map, entry.lineIndex, entry.sideDefIndex, isMaskedMidWall, ctx.drawWall);
  }
}

export function collectGzdoomTransparentWalls(
  map: WadMap,
  drawState: GzdoomDrawState,
  buffers: MapBuffers,
  cameraPos: [number, number, number],
  getWallDistanceSq: (wall: MapBuffers['walls'][number], cameraPos: [number, number, number]) => number
): Array<{ wall: MapBuffers['walls'][number]; distanceSq: number }> {
  const pool: Array<{ wall: MapBuffers['walls'][number]; distanceSq: number }> = [];

  for (const entry of drawState.wallDrawOrder) {
    const range = wallSliceForEntry(buffers, map, entry.lineIndex, entry.sideDefIndex);
    if (!range || range.start < 0 || range.count <= 0) continue;

    for (let wi = range.start; wi < range.start + range.count; wi++) {
      const wall = buffers.walls[wi];
      if (!wall) continue;
      if (!wall.transparent || isMaskedMidWall(wall)) continue;
      pool.push({ wall, distanceSq: getWallDistanceSq(wall, cameraPos) });
    }
  }

  if (pool.length > 1) {
    pool.sort((a, b) => b.distanceSq - a.distanceSq);
  }
  return pool;
}
