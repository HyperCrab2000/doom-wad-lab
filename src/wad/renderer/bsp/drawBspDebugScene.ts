/**
 * Barebones first-person BSP debug: wireframe segs at sector floor/ceiling height.
 * No textures — only classic visibility colors.
 */

import { createBuffer, createElementBuffer, createProgram } from 'apl-easy-gl';
import type { mat4 } from 'gl-matrix';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import type { ClassicBspTrace, SegVisibilityReason } from '@/wad/renderer/bsp/classicBspTrace';
import { traceClassicBsp } from '@/wad/renderer/bsp/classicBspTrace';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildBspDebugTrace } from '@/wad/renderer/bsp/bspDebugView';
import { appendWallSegWireframe } from '@/wad/renderer/modular/bspSegWireframe';

const DEBUG_VERT = `#version 300 es
in vec3 aPosition;
uniform mat4 modelViewProj;
void main() {
  gl_Position = modelViewProj * vec4(aPosition, 1.0);
}`;

const DEBUG_FRAG = `#version 300 es
precision mediump float;
uniform vec3 uColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, 1.0);
}`;

const REASON_RGB: Record<SegVisibilityReason, [number, number, number]> = {
  visible: [0, 1, 0.4],
  validcount: [0, 0.65, 0.25],
  backface: [1, 0.8, 0],
  clip: [1, 0.2, 0.2],
  no_linedef: [0.35, 0.35, 0.35],
  no_side: [0.3, 0.3, 0.3],
  not_reached: [0.12, 0.12, 0.12],
};

const DRAW_ORDER: SegVisibilityReason[] = ['backface', 'clip', 'validcount', 'visible'];

let cachedProgram: ReturnType<typeof createProgram> | null = null;

export interface DrawBspDebugSceneParams {
  gl: WebGL2RenderingContext;
  map: WadMap;
  buffers: MapBuffers;
  modelViewProjMatrix: mat4;
  viewX: number;
  viewY: number;
  viewYaw: number;
  trace?: ClassicBspTrace;
}

export function drawBspDebugScene(params: DrawBspDebugSceneParams): ClassicBspTrace {
  const { gl, map, buffers, modelViewProjMatrix, viewX, viewY, viewYaw } = params;
  const index = buffers.bspRenderIndex ?? buildBspRenderIndex(map);

  gl.clearColor(0.02, 0.02, 0.04, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (!index) {
    return traceClassicBsp({
      map,
      index: {
        subsectorToSector: [],
        subsectorSegs: [],
        segLineIndex: [],
        segSideIndex: [],
        segFrontSector: [],
        nodeCount: 0,
      },
      viewX,
      viewY,
      viewYaw,
    });
  }

  const trace =
    params.trace ??
    buildBspDebugTrace(map, index, { x: viewX, y: viewY, yaw: viewYaw });

  if (!cachedProgram) {
    cachedProgram = createProgram(gl, DEBUG_VERT, DEBUG_FRAG);
  }

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(cachedProgram.program);
  cachedProgram.setUniforms({ modelViewProj: modelViewProjMatrix });

  for (const reason of DRAW_ORDER) {
    const positions: number[] = [];
    const indices: number[] = [];

    for (const entry of trace.segByIndex.values()) {
      if (entry.reason !== reason) continue;
      const seg = map.SEGS[entry.segIndex];
      if (!seg) continue;
      const v1 = map.VERTEXES[seg.v1];
      const v2 = map.VERTEXES[seg.v2];
      if (!v1 || !v2) continue;

      const sectorIndex = index.segFrontSector[entry.segIndex] ?? -1;
      const sector = sectorIndex >= 0 ? map.SECTORS[sectorIndex] : null;
      const floor = sector?.floorheight ?? 0;
      const ceil = sector?.ceilingheight ?? floor + 128;

      appendWallSegWireframe(positions, indices, v1.x, v1.y, v2.x, v2.y, floor, ceil);
    }

    if (positions.length === 0) continue;

    const posBuf = createBuffer(gl, new Float32Array(positions), 3);
    const idxBuf = createElementBuffer(gl, new Uint16Array(indices), 1);
    cachedProgram.setUniforms({ uColor: REASON_RGB[reason] });
    cachedProgram.setAttributes({ aPosition: posBuf });
    idxBuf.draw(gl.LINES);
  }

  return trace;
}
