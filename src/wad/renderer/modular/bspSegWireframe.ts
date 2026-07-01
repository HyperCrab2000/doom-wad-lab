/**
 * Floor-to-ceiling wireframe from draw lists.
 * `production` = raw BSP DoSubsector lists (debug — pass-wall leaks).
 * `portal` = mesh pool filtered by primary-ray hits (1b).
 */

import { createBuffer, createElementBuffer, createProgram } from 'apl-easy-gl';
import type { mat4 } from 'gl-matrix';

import type { WadMap } from '@/wad/interfaces/WadMap';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import type { WallDrawEntry } from '@/wad/renderer/bsp/bspVisibility';
import { pushSubsectorPolygonRing } from '@/wad/renderer/modular/drawGzdoomMeshWireframe';
import { prepareWireframeGlState } from '@/wad/renderer/modular/drawGzdoomMeshWireframe';
import {
  drawCachedIndexedLines,
  drawCachedLineArrays,
  hashWallFlatDrawKey,
} from '@/wad/renderer/modular/wireframeDrawCache';

const VERT = `#version 300 es
in vec3 aPosition;
uniform mat4 modelViewProj;
void main() {
  gl_Position = modelViewProj * vec4(aPosition, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, uAlpha);
}`;

let program: ReturnType<typeof createProgram> | null = null;

const bspWallGeomCache: { current: { key: number; positions: number[]; indices: number[]; indexCount: number } | null } =
  { current: null };
const bspFlatGeomCache: { current: { key: number; positions: number[]; vertexCount: number } | null } = {
  current: null,
};
const bspWallLineBufCache: { current: null | { key: number; posBuffer: ReturnType<typeof createBuffer>; idxBuffer: ReturnType<typeof createElementBuffer>; indexCount: number } } =
  { current: null };
const bspFlatLineBufCache: { current: null | { key: number; buffer: ReturnType<typeof createBuffer>; vertexCount: number } } =
  { current: null };

export type BspSegWireframeMode = 'production' | 'portal';

export interface DrawBspVisibleSegWireframeParams {
  gl: WebGL2RenderingContext;
  map: WadMap;
  buffers: MapBuffers;
  drawState: GzdoomDrawState;
  modelViewProjMatrix: mat4;
  mode?: BspSegWireframeMode;
  depthTest?: boolean;
  depthWrite?: boolean;
  wallColor?: [number, number, number];
  flatColor?: [number, number, number];
  alpha?: number;
}

function wallEntryKey(entry: WallDrawEntry): string {
  return `${entry.lineIndex}:${entry.sideDefIndex}`;
}

/** BSP entries portal ∩ REJECT would remove (debug stats only). */
export function wallDrawOrderPortalCulled(drawState: GzdoomDrawState): readonly WallDrawEntry[] {
  const portalKeys = new Set(drawState.portalWallDrawOrder.map(wallEntryKey));
  return drawState.wallDrawOrder.filter((entry) => !portalKeys.has(wallEntryKey(entry)));
}

export function flatSubsectorOrderPortalCulled(drawState: GzdoomDrawState): readonly number[] {
  const portalSet = new Set(drawState.portalFlatSubsectorOrder);
  return drawState.flatSubsectorOrder.filter((subsectorIndex) => !portalSet.has(subsectorIndex));
}

function resolveWallDrawOrder(
  drawState: GzdoomDrawState,
  mode: BspSegWireframeMode
): readonly WallDrawEntry[] {
  if (mode === 'portal') {
    return drawState.wallDrawOrder;
  }
  return drawState.bspWallDrawOrder;
}

function resolveFlatSubsectorOrder(
  drawState: GzdoomDrawState,
  mode: BspSegWireframeMode
): readonly number[] {
  if (mode === 'portal') {
    return drawState.flatSubsectorOrder;
  }
  return drawState.bspFlatSubsectorOrder;
}

export function appendWallSegWireframe(
  positions: number[],
  indices: number[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  floor: number,
  ceil: number
): void {
  const base = positions.length / 3;
  const z1 = -y1;
  const z2 = -y2;

  positions.push(
    x1, floor, z1,
    x2, floor, z2,
    x2, ceil, z2,
    x1, ceil, z1
  );

  indices.push(
    base, base + 1,
    base + 1, base + 2,
    base + 2, base + 3,
    base + 3, base
  );
}

function ensureProgram(gl: WebGL2RenderingContext) {
  if (!program) {
    program = createProgram(gl, VERT, FRAG);
  }
  gl.useProgram(program.program);
  return program;
}

export function drawBspVisibleSegWireframe(params: DrawBspVisibleSegWireframeParams): {
  wallLines: number;
  flatLines: number;
} {
  const { gl, map, buffers, drawState, modelViewProjMatrix } = params;
  const mode = params.mode ?? 'production';
  const wallColor = params.wallColor ?? [1.0, 0.85, 0.2];
  const flatColor = params.flatColor ?? [0.55, 0.55, 0.62];
  const alpha = params.alpha ?? 1.0;
  const depthTest = params.depthTest ?? false;
  const depthWrite = params.depthWrite ?? false;
  const index = buffers.bspRenderIndex;
  if (!index) {
    return { wallLines: 0, flatLines: 0 };
  }

  const wallDrawOrder = resolveWallDrawOrder(drawState, mode);
  const flatSubsectorOrder = resolveFlatSubsectorOrder(drawState, mode);
  const salt = mode === 'portal' ? 2 : 0;
  const geomKey = hashWallFlatDrawKey(wallDrawOrder, flatSubsectorOrder, salt);

  let wallPositions: number[] = [];
  let wallIndices: number[] = [];
  let flatPositions: number[] = [];

  if (bspWallGeomCache.current?.key === geomKey) {
    wallPositions = bspWallGeomCache.current.positions;
    wallIndices = bspWallGeomCache.current.indices;
    flatPositions = bspFlatGeomCache.current?.positions ?? [];
  } else {
    for (const entry of wallDrawOrder) {
      const line = map.LINEDEFS[entry.lineIndex];
      if (!line) continue;
      const v1 = map.VERTEXES[line.v1];
      const v2 = map.VERTEXES[line.v2];
      if (!v1 || !v2) continue;

      const sectorIndex = map.SIDEDEFS[entry.sideDefIndex]?.sector ?? -1;
      const sector = sectorIndex >= 0 ? map.SECTORS[sectorIndex] : null;
      const floor = sector?.floorheight ?? 0;
      const ceil = sector?.ceilingheight ?? floor + 128;

      appendWallSegWireframe(wallPositions, wallIndices, v1.x, v1.y, v2.x, v2.y, floor, ceil);
    }

    for (const subsectorIndex of flatSubsectorOrder) {
      const segIndices = index.subsectorSegs[subsectorIndex];
      if (!segIndices || segIndices.length < 3) continue;
      const sectorIndex = index.subsectorToSector[subsectorIndex] ?? -1;
      const sector = map.SECTORS[sectorIndex];
      if (!sector) continue;
      pushSubsectorPolygonRing(flatPositions, map, segIndices, sector.floorheight);
      pushSubsectorPolygonRing(flatPositions, map, segIndices, sector.ceilingheight);
    }

    bspWallGeomCache.current = {
      key: geomKey,
      positions: wallPositions,
      indices: wallIndices,
      indexCount: wallIndices.length,
    };
    bspFlatGeomCache.current = {
      key: geomKey,
      positions: flatPositions,
      vertexCount: flatPositions.length / 3,
    };
    bspWallLineBufCache.current = null;
    bspFlatLineBufCache.current = null;
  }

  const prog = ensureProgram(gl);
  let wallLines = 0;

  prepareWireframeGlState(gl, { depthTest, depthWrite });
  if (alpha < 1) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  if (wallPositions.length > 0) {
    prog.setUniforms({ modelViewProj: modelViewProjMatrix, uColor: wallColor, uAlpha: alpha });
    wallLines = drawCachedIndexedLines(gl, prog, bspWallLineBufCache, geomKey, wallPositions, wallIndices);
  }

  prepareWireframeGlState(gl, { depthTest, depthWrite: depthTest ? false : depthWrite });
  if (alpha < 1) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  let flatLines = 0;
  if (flatPositions.length > 0) {
    prog.setUniforms({ modelViewProj: modelViewProjMatrix, uColor: flatColor, uAlpha: alpha });
    flatLines = drawCachedLineArrays(gl, prog, bspFlatLineBufCache, geomKey, flatPositions);
  }

  return { wallLines, flatLines };
}
