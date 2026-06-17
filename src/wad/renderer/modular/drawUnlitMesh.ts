/**
 * Unlit mesh draws for modular stages flatsUnlit / wallsUnlit.
 * Uses sector ambient color — same geometry as classic, no texture/light shaders yet.
 */

import { createBuffer, createProgram } from 'apl-easy-gl';
import type { mat4 } from 'gl-matrix';

import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';

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

function sectorColor(sector: MapBuffers['walls'][number]['sector']): [number, number, number] {
  const c = sector.ambientColor ?? [0.55, 0.55, 0.55];
  return [c[0], c[1], c[2]];
}

export function drawUnlitWallMesh(
  gl: WebGL2RenderingContext,
  modelViewProjMatrix: mat4,
  wall: MapBuffers['walls'][number]
): void {
  if (!program) {
    program = createProgram(gl, VERT, FRAG);
  }
  gl.useProgram(program.program);
  program.setUniforms({
    modelViewProj: modelViewProjMatrix,
    uColor: sectorColor(wall.sector),
  });
  const posBuf = createBuffer(gl, wall.position, 3);
  program.setAttributes({ aPosition: posBuf });
  wall.indices.draw();
}

export function drawUnlitFlatMesh(
  gl: WebGL2RenderingContext,
  modelViewProjMatrix: mat4,
  flat: MapBuffers['flats'][number]
): void {
  if (!program) {
    program = createProgram(gl, VERT, FRAG);
  }
  gl.useProgram(program.program);
  program.setUniforms({
    modelViewProj: modelViewProjMatrix,
    uColor: sectorColor(flat.sector),
  });
  const posBuf = createBuffer(gl, flat.position, 3);
  program.setAttributes({ aPosition: posBuf });
  flat.indices.draw();
}
