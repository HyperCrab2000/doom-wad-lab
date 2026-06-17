/**
 * Stage: meshWireframe — BSP-visible wall band outlines + subsector floor/ceiling outlines.
 * Uses mesh boundary edges only (no internal triangle diagonals).
 */

import { createBuffer, createProgram } from 'apl-easy-gl';
import type { mat4 } from 'gl-matrix';

import type { WadMap } from '@/wad/interfaces/WadMap';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import type { WallDrawEntry } from '@/wad/renderer/bsp/bspVisibility';
import { subsectorPolygonVertices } from '@/wad/renderer/geometry/subsectorToTriangles';
import {
  wallSliceForEntry,
} from '@/wad/renderer/gzdoom/gzdoomRenderer';
import {
  drawCachedIndexedLines,
  drawCachedLineArrays,
  hashWallFlatDrawKey,
} from '@/wad/renderer/modular/wireframeDrawCache';

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Outline edges shared by one triangle only — skips internal mesh diagonals. */
export function pushMeshBoundaryEdges(
  positions: number[],
  position: Float32Array,
  indices: Uint16Array
): void {
  const edgeCount = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[i + e];
      const b = indices[i + ((e + 1) % 3)];
      const key = edgeKey(a, b);
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }

  for (const [key, count] of edgeCount) {
    if (count !== 1) continue;
    const [a, b] = key.split(':').map(Number);
    positions.push(
      position[a * 3],
      position[a * 3 + 1],
      position[a * 3 + 2],
      position[b * 3],
      position[b * 3 + 1],
      position[b * 3 + 2]
    );
  }
}

export function countMeshBoundaryEdges(indices: Uint16Array): number {
  const edgeCount = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[i + e];
      const b = indices[i + ((e + 1) % 3)];
      const key = edgeKey(a, b);
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }
  let count = 0;
  for (const hits of edgeCount.values()) {
    if (hits === 1) count++;
  }
  return count;
}

/** Every triangle edge — shows GPU mesh triangulation (internal diagonals). */
export function pushAllTriangleEdges(
  positions: number[],
  position: Float32Array,
  indices: Uint16Array
): void {
  for (let i = 0; i < indices.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[i + e]!;
      const b = indices[i + ((e + 1) % 3)]!;
      positions.push(
        position[a * 3],
        position[a * 3 + 1],
        position[a * 3 + 2],
        position[b * 3],
        position[b * 3 + 1],
        position[b * 3 + 2]
      );
    }
  }
}

export function countAllTriangleEdges(indices: Uint16Array): number {
  return indices.length;
}

/** Sector/subsector footprint — avoids duplicated per-triangle flat mesh vertices. */
export function pushSubsectorPolygonRing(
  positions: number[],
  map: WadMap,
  segIndices: readonly number[],
  height: number
): number {
  const verts = subsectorPolygonVertices(map, segIndices);
  if (verts.length < 3) return 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    positions.push(a.x, height, -a.y, b.x, height, -b.y);
  }
  return verts.length;
}

export function countSubsectorPolygonEdges(map: WadMap, segIndices: readonly number[]): number {
  const verts = subsectorPolygonVertices(map, segIndices);
  return verts.length >= 3 ? verts.length : 0;
}

export type MeshWireframeEdgeMode = 'boundary' | 'triangles';

const VERT = `#version 300 es
in vec3 aPosition;
uniform mat4 modelViewProj;
void main() {
  gl_Position = modelViewProj * vec4(aPosition, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
uniform vec3 uColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, 1.0);
}`;

let program: ReturnType<typeof createProgram> | null = null;

function resolveFlatSubsectorOrder(
  drawState: GzdoomDrawState,
  visibility: MeshWireframeVisibility
): readonly number[] {
  if (visibility === 'portal') {
    return drawState.flatSubsectorOrder;
  }
  return drawState.bspFlatSubsectorOrder;
}

function resolveWallDrawOrder(
  drawState: GzdoomDrawState,
  visibility: MeshWireframeVisibility
): readonly WallDrawEntry[] {
  if (visibility === 'portal') {
    return drawState.wallDrawOrder;
  }
  return drawState.bspWallDrawOrder;
}

export interface WireframeGlStateOptions {
  /** Test against existing depth (solid geometry). Default true. */
  depthTest?: boolean;
  /** Write line depth — default false so wall/flat batches do not break each other. */
  depthWrite?: boolean;
}

/** GL state for line draws (overlay or wireframe-only debug). */
export function prepareWireframeGlState(
  gl: WebGL2RenderingContext,
  options: WireframeGlStateOptions = {}
): void {
  const depthTest = options.depthTest ?? true;
  const depthWrite = options.depthWrite ?? false;

  if (depthTest) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
  } else {
    gl.disable(gl.DEPTH_TEST);
  }
  gl.depthMask(depthWrite);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
}

function pushEdgesForMode(
  positions: number[],
  position: Float32Array,
  indices: Uint16Array,
  mode: MeshWireframeEdgeMode
): void {
  if (mode === 'triangles') {
    pushAllTriangleEdges(positions, position, indices);
  } else {
    pushMeshBoundaryEdges(positions, position, indices);
  }
}

export type MeshWireframeVisibility = 'bsp' | 'portal';

const meshWallGeomCache: { current: { key: number; positions: number[]; vertexCount: number } | null } = {
  current: null,
};
const meshFlatGeomCache: { current: { key: number; positions: number[]; vertexCount: number } | null } = {
  current: null,
};
const meshWallLineBufCache: { current: null | { key: number; buffer: ReturnType<typeof createBuffer>; vertexCount: number } } =
  { current: null };
const meshFlatLineBufCache: { current: null | { key: number; buffer: ReturnType<typeof createBuffer>; vertexCount: number } } =
  { current: null };

export interface DrawGzdoomMeshWireframeParams {
  gl: WebGL2RenderingContext;
  map: WadMap;
  buffers: MapBuffers;
  drawState: GzdoomDrawState;
  modelViewProjMatrix: mat4;
  edgeMode?: MeshWireframeEdgeMode;
  /** `bsp` = production RenderBSP draw lists; `portal` = portal/REJECT connectivity debug. */
  visibility?: MeshWireframeVisibility;
  wallColor?: [number, number, number];
  flatColor?: [number, number, number];
  /** When false (wireframe-only), draw all lines without depth self-occlusion. Default true. */
  depthTest?: boolean;
  depthWrite?: boolean;
}

export function drawGzdoomMeshWireframe(params: DrawGzdoomMeshWireframeParams): {
  wallLines: number;
  flatLines: number;
} {
  const { gl, map, buffers, drawState, modelViewProjMatrix } = params;
  const edgeMode = params.edgeMode ?? 'boundary';
  const visibility = params.visibility ?? 'bsp';
  const wallDrawOrder = resolveWallDrawOrder(drawState, visibility);
  const flatSubsectorOrder = resolveFlatSubsectorOrder(drawState, visibility);
  const wallColor = params.wallColor ?? (edgeMode === 'triangles' ? [1.0, 0.45, 0.1] : [1.0, 0.85, 0.2]);
  const flatColor = params.flatColor ?? (edgeMode === 'triangles' ? [0.85, 0.35, 1.0] : [0.35, 0.65, 1.0]);
  const salt = (edgeMode === 'triangles' ? 1 : 0) | (visibility === 'portal' ? 2 : 0);
  const geomKey = hashWallFlatDrawKey(wallDrawOrder, flatSubsectorOrder, salt);

  let wallPositions: number[] = [];
  let flatPositions: number[] = [];
  if (meshWallGeomCache.current?.key === geomKey) {
    wallPositions = meshWallGeomCache.current.positions;
    flatPositions = meshFlatGeomCache.current?.positions ?? [];
  } else {
    for (const entry of wallDrawOrder) {
      const range = wallSliceForEntry(buffers, map, entry.lineIndex, entry.sideDefIndex);
      if (!range || range.start < 0 || range.count <= 0) continue;
      for (let wi = range.start; wi < range.start + range.count; wi++) {
        const wall = buffers.walls[wi];
        if (!wall || wall.transparent) continue;
        pushEdgesForMode(wallPositions, wall.cpuPosition, wall.cpuIndices, edgeMode);
      }
    }

    const visibleSubsectors = new Set(flatSubsectorOrder);
    const bspIndex = buffers.bspRenderIndex;

    if (edgeMode === 'boundary' && bspIndex) {
      for (const subsectorIndex of flatSubsectorOrder) {
        const segIndices = bspIndex.subsectorSegs[subsectorIndex];
        if (!segIndices || segIndices.length < 3) continue;
        const sectorIndex = bspIndex.subsectorToSector[subsectorIndex] ?? -1;
        const sector = map.SECTORS[sectorIndex];
        if (!sector) continue;
        pushSubsectorPolygonRing(flatPositions, map, segIndices, sector.floorheight);
      }
    } else {
      for (const flat of buffers.subsectorFlats) {
        if ((flat.subsectorIndex ?? -1) < 0 || !visibleSubsectors.has(flat.subsectorIndex!)) continue;
        pushEdgesForMode(flatPositions, flat.cpuPosition, flat.cpuIndices, edgeMode);
      }
    }

    meshWallGeomCache.current = {
      key: geomKey,
      positions: wallPositions,
      vertexCount: wallPositions.length / 3,
    };
    meshFlatGeomCache.current = {
      key: geomKey,
      positions: flatPositions,
      vertexCount: flatPositions.length / 3,
    };
    meshWallLineBufCache.current = null;
    meshFlatLineBufCache.current = null;
  }

  if (!program) {
    program = createProgram(gl, VERT, FRAG);
  }

  const depthTest = params.depthTest ?? true;
  const depthWrite = params.depthWrite ?? depthTest;

  prepareWireframeGlState(gl, { depthTest, depthWrite });
  gl.useProgram(program.program);
  program.setUniforms({ modelViewProj: modelViewProjMatrix });
  gl.lineWidth(1);

  let wallLines = 0;
  if (wallPositions.length > 0) {
    program.setUniforms({ uColor: wallColor });
    wallLines = drawCachedLineArrays(gl, program, meshWallLineBufCache, geomKey, wallPositions);
  }

  prepareWireframeGlState(gl, { depthTest, depthWrite: depthTest ? false : depthWrite });
  gl.useProgram(program.program);
  program.setUniforms({ modelViewProj: modelViewProjMatrix });

  let flatLines = 0;
  if (flatPositions.length > 0) {
    program.setUniforms({ uColor: flatColor });
    flatLines = drawCachedLineArrays(gl, program, meshFlatLineBufCache, geomKey, flatPositions);
  }

  return { wallLines, flatLines };
}

/** Collect-only helpers used by tests. */
export function countGzdoomMeshWireframeSegments(
  map: WadMap,
  buffers: MapBuffers,
  drawState: GzdoomDrawState,
  edgeMode: MeshWireframeEdgeMode = 'boundary',
  visibility: MeshWireframeVisibility = 'bsp'
): { wallSegments: number; flatSegments: number } {
  const countEdges = edgeMode === 'triangles' ? countAllTriangleEdges : countMeshBoundaryEdges;
  const wallDrawOrder = resolveWallDrawOrder(drawState, visibility);
  const flatSubsectorOrder = resolveFlatSubsectorOrder(drawState, visibility);
  let wallSegments = 0;
  let flatSegments = 0;

  for (const entry of wallDrawOrder) {
    const range = wallSliceForEntry(buffers, map, entry.lineIndex, entry.sideDefIndex);
    if (!range) continue;
    for (let wi = range.start; wi < range.start + range.count; wi++) {
      const wall = buffers.walls[wi];
      if (!wall || wall.transparent) continue;
      wallSegments += countEdges(wall.cpuIndices);
    }
  }

  const visibleSubsectors = new Set(flatSubsectorOrder);
  const bspIndex = buffers.bspRenderIndex;

  if (edgeMode === 'boundary' && bspIndex) {
    for (const subsectorIndex of flatSubsectorOrder) {
      const segIndices = bspIndex.subsectorSegs[subsectorIndex];
      if (!segIndices || segIndices.length < 3) continue;
      flatSegments += countSubsectorPolygonEdges(map, segIndices);
    }
  } else {
    for (const flat of buffers.subsectorFlats) {
      if ((flat.subsectorIndex ?? -1) < 0 || !visibleSubsectors.has(flat.subsectorIndex!)) continue;
      flatSegments += countEdges(flat.cpuIndices);
    }
  }

  return { wallSegments, flatSegments };
}
