import { mat4 } from 'gl-matrix';
import type { ShaderProgram } from 'apl-easy-gl';

import { PSPRITE_SHADE_OFFSET } from '@/wad/parity/frame/gzdoomColormap';
import { getEffectiveSectorLightLevel } from '@/wad/renderer/renderGame/sectorDynamicLight';
import type { Sector } from '@/wad/interfaces/Sector';
import type { GameViewLayout } from '@/wad/renderer/renderGame/gameViewLayout';

/** Idle pistol frame for parity spawn (`PISG` frame `A`, index 0). */
const PSPRITE_TEXTURE = 'PISGA0';

let pspriteBuffers: {
  position: WebGLBuffer;
  uv: WebGLBuffer;
  indices: WebGLBuffer;
  indexCount: number;
} | null = null;

function ensurePspriteBuffers(gl: WebGL2RenderingContext) {
  if (pspriteBuffers) return pspriteBuffers;

  const positions = new Float32Array([
    -0.55, -1, 0,
    0.55, -1, 0,
    -0.55, -0.35, 0,
    0.55, -0.35, 0,
  ]);
  const uvs = new Float32Array([
    0, 1,
    1, 1,
    0, 0,
    1, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);

  const position = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, position);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const uv = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, uv);
  gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);

  const indexBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  pspriteBuffers = {
    position,
    uv,
    indices: indexBuf,
    indexCount: indices.length,
  };
  return pspriteBuffers;
}

export function drawParityPsprite(params: {
  gl: WebGL2RenderingContext;
  thingShader: ShaderProgram;
  layout: GameViewLayout;
  textures: Record<string, WebGLTexture>;
  sector: Sector | null;
  timeSeconds: number;
  colormapLut: WebGLTexture;
}): boolean {
  const { gl, thingShader, textures, sector, timeSeconds, colormapLut } = params;
  const tex =
    textures[PSPRITE_TEXTURE] ??
    textures[PSPRITE_TEXTURE.toUpperCase()] ??
    textures.PISGA0;
  if (!tex || !sector) return false;

  const buffers = ensurePspriteBuffers(gl);
  const mvp = mat4.create();
  mat4.ortho(mvp, -1, 1, -1, 1, -1, 1);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.DEPTH_TEST);

  gl.useProgram(thingShader.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);

  thingShader.setUniforms({
    parityColormap: 1,
    colormapLut,
    parityUseColumnVis: 1,
    paritySpriteVis: 0,
    parityShadeOffset: PSPRITE_SHADE_OFFSET,
    parityWallVisLeft: 0,
    parityWallVisRight: 0,
    shouldMirror: false,
    modelViewProj: mvp,
    centerClipZ: 0,
    centerClipW: 1,
    tex,
    lightIntensity: 0,
    fogColor: [0, 0, 0],
    fogDensity: 0,
    visibilityDistance: 1,
    nearbyLight: [0, 0, 0],
    emissiveColor: [0, 0, 0],
    emissiveTopExtent: 0,
    emissiveFullColumn: 0,
    emissiveStrength: 0,
    sectorLightLevel: getEffectiveSectorLightLevel(sector, timeSeconds),
  });

  const posLoc = gl.getAttribLocation(thingShader.program, 'aPosition');
  const uvLoc = gl.getAttribLocation(thingShader.program, 'aUv');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.uv);
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
  gl.drawElements(gl.TRIANGLES, buffers.indexCount, gl.UNSIGNED_SHORT, 0);

  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  return true;
}
