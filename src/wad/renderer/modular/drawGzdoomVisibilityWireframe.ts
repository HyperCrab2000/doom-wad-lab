/**
 * Stage: visibilityWireframe — draw BSP-visible linedefs from GzdoomDrawState.
 * Same linedef set as `renderGzdoomOpaqueWalls` uses (wallDrawOrder).
 */

import { createBuffer, createProgram } from 'apl-easy-gl';
import type { mat4 } from 'gl-matrix';

import type { WadMap } from '@/wad/interfaces/WadMap';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';

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

export interface DrawGzdoomVisibilityWireframeParams {
  gl: WebGL2RenderingContext;
  map: WadMap;
  drawState: GzdoomDrawState;
  modelViewProjMatrix: mat4;
  /** Line height in world units (typically sector floor). */
  floorZ?: number;
  color?: [number, number, number];
}

export function drawGzdoomVisibilityWireframe(params: DrawGzdoomVisibilityWireframeParams): number {
  const { gl, map, drawState, modelViewProjMatrix } = params;
  const color = params.color ?? [0.2, 1.0, 0.45];
  const positions: number[] = [];

  for (const entry of drawState.wallDrawOrder) {
    const line = map.LINEDEFS[entry.lineIndex];
    if (!line) continue;
    const v0 = map.VERTEXES[line.v1];
    const v1 = map.VERTEXES[line.v2];
    if (!v0 || !v1) continue;

    const sectorIndex = map.SIDEDEFS[entry.sideDefIndex]?.sector ?? drawState.cameraSectorIndex;
    const sector = map.SECTORS[sectorIndex] ?? map.SECTORS[drawState.cameraSectorIndex];
    const z = params.floorZ ?? sector?.floorheight ?? 0;

    positions.push(v0.x, z, -v0.y, v1.x, z, -v1.y);
  }

  if (positions.length === 0) return 0;

  if (!program) {
    program = createProgram(gl, VERT, FRAG);
  }

  gl.useProgram(program.program);
  program.setUniforms({ modelViewProj: modelViewProjMatrix, uColor: color });
  gl.lineWidth(1);

  const buf = createBuffer(gl, new Float32Array(positions), 3);
  program.setAttributes({ aPosition: buf });
  gl.drawArrays(gl.LINES, 0, positions.length / 3);
  return drawState.wallDrawOrder.length;
}
