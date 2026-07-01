import { createBuffer } from 'apl-easy-gl';

import type { PointLight } from '@/wad/renderer/renderGame/sectorLighting';
import pathTraceVert from './shaders/pathTrace.vert';
import pathTraceFrag from './shaders/pathTrace.frag';

export const MAX_PATH_TRACE_POINT_LIGHTS = 32;

const blitVert = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const blitFrag = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_color;
uniform float u_keySky;
void main() {
  // Canvas row 0 is top; GL texture upload puts it at v=0 (bottom) unless flipped.
  vec4 c = texture(u_color, vec2(v_uv.x, 1.0 - v_uv.y));
  if (u_keySky > 0.5 && distance(c.rgb, vec3(0.451, 0.620, 0.878)) < 0.05) {
    discard;
  }
  fragColor = c;
}`;

export interface PathTraceUniforms {
  invViewProj: WebGLUniformLocation | null;
  traceSize: WebGLUniformLocation | null;
  triangleCount: WebGLUniformLocation | null;
  triangleTexWidth: WebGLUniformLocation | null;
  atlasCols: WebGLUniformLocation | null;
  atlasRows: WebGLUniformLocation | null;
  triangles: WebGLUniformLocation | null;
  triColors: WebGLUniformLocation | null;
  sectorLight: WebGLUniformLocation | null;
  atlas: WebGLUniformLocation | null;
  surfaceMask: WebGLUniformLocation | null;
  useTextures: WebGLUniformLocation | null;
  dynamicLights: WebGLUniformLocation | null;
  coloredLights: WebGLUniformLocation | null;
  packOrigin: WebGLUniformLocation | null;
  packScale: WebGLUniformLocation | null;
  cameraPos: WebGLUniformLocation | null;
  pointLights: WebGLUniformLocation | null;
  pointLightCount: WebGLUniformLocation | null;
  sky: WebGLUniformLocation | null;
  skyYaw: WebGLUniformLocation | null;
  skyPitch: WebGLUniformLocation | null;
  hasSky: WebGLUniformLocation | null;
  blitColor: WebGLUniformLocation | null;
}

export interface PathTraceGpuState {
  pathTraceProgram: WebGLProgram;
  blitProgram: WebGLProgram;
  uniforms: PathTraceUniforms;
  quadBuffer: ReturnType<typeof createBuffer>;
  triangleTexture: WebGLTexture;
  colorTexture: WebGLTexture;
  sectorLightTexture: WebGLTexture;
  pointLightTexture: WebGLTexture;
  skyTexture: WebGLTexture;
  lowResFbo: WebGLFramebuffer;
  lowResColor: WebGLTexture;
  lowResWidth: number;
  lowResHeight: number;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'shader compile failed';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'shader link failed');
  }
  return program;
}

function cacheUniforms(gl: WebGL2RenderingContext, prog: WebGLProgram, blit: WebGLProgram): PathTraceUniforms {
  gl.useProgram(prog);
  const uniforms = {
    invViewProj: gl.getUniformLocation(prog, 'u_invViewProj'),
    traceSize: gl.getUniformLocation(prog, 'u_traceSize'),
    triangleCount: gl.getUniformLocation(prog, 'u_triangleCount'),
    triangleTexWidth: gl.getUniformLocation(prog, 'u_triangleTexWidth'),
    atlasCols: gl.getUniformLocation(prog, 'u_atlasCols'),
    atlasRows: gl.getUniformLocation(prog, 'u_atlasRows'),
    triangles: gl.getUniformLocation(prog, 'u_triangles'),
    triColors: gl.getUniformLocation(prog, 'u_triColors'),
    sectorLight: gl.getUniformLocation(prog, 'u_sectorLight'),
    atlas: gl.getUniformLocation(prog, 'u_atlas'),
    surfaceMask: gl.getUniformLocation(prog, 'u_surfaceMask'),
    useTextures: gl.getUniformLocation(prog, 'u_useTextures'),
    dynamicLights: gl.getUniformLocation(prog, 'u_dynamicLights'),
    coloredLights: gl.getUniformLocation(prog, 'u_coloredLights'),
    packOrigin: gl.getUniformLocation(prog, 'u_packOrigin'),
    packScale: gl.getUniformLocation(prog, 'u_packScale'),
    cameraPos: gl.getUniformLocation(prog, 'u_cameraPos'),
    pointLights: gl.getUniformLocation(prog, 'u_pointLights'),
    pointLightCount: gl.getUniformLocation(prog, 'u_pointLightCount'),
    sky: gl.getUniformLocation(prog, 'u_sky'),
    skyYaw: gl.getUniformLocation(prog, 'u_skyYaw'),
    skyPitch: gl.getUniformLocation(prog, 'u_skyPitch'),
    hasSky: gl.getUniformLocation(prog, 'u_hasSky'),
    blitColor: gl.getUniformLocation(blit, 'u_color'),
  };
  const missing = Object.entries(uniforms)
    .filter(([name, loc]) => name !== 'blitColor' && loc === null)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Path trace shader missing uniforms: ${missing.join(', ')}`);
  }
  return uniforms;
}

export function createPathTraceGpuState(gl: WebGL2RenderingContext): PathTraceGpuState {
  const pathTraceProgram = linkProgram(gl, pathTraceVert, pathTraceFrag);
  const blitProgram = linkProgram(gl, blitVert, blitFrag);
  const uniforms = cacheUniforms(gl, pathTraceProgram, blitProgram);
  const quadBuffer = createBuffer(gl, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2);

  const triangleTexture = gl.createTexture()!;
  const colorTexture = gl.createTexture()!;
  const sectorLightTexture = gl.createTexture()!;
  const pointLightTexture = gl.createTexture()!;
  const skyTexture = gl.createTexture()!;
  const lowResColor = gl.createTexture()!;
  const lowResFbo = gl.createFramebuffer()!;

  for (const tex of [triangleTexture, colorTexture, sectorLightTexture, pointLightTexture]) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  return {
    pathTraceProgram,
    blitProgram,
    uniforms,
    quadBuffer,
    triangleTexture,
    colorTexture,
    sectorLightTexture,
    pointLightTexture,
    skyTexture,
    lowResFbo,
    lowResColor,
    lowResWidth: 0,
    lowResHeight: 0,
  };
}

export function clearPathTraceCanvas(gl: WebGL2RenderingContext): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(1.0, 0.0, 1.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function ensureLowResTarget(
  gl: WebGL2RenderingContext,
  state: PathTraceGpuState,
  width: number,
  height: number
): void {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (state.lowResWidth === w && state.lowResHeight === h) return;

  state.lowResWidth = w;
  state.lowResHeight = h;
  gl.bindTexture(gl.TEXTURE_2D, state.lowResColor);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, state.lowResFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, state.lowResColor, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

export function drawFullscreenQuad(
  gl: WebGL2RenderingContext,
  quadBuffer: ReturnType<typeof createBuffer>,
  program: WebGLProgram
): void {
  gl.useProgram(program);
  const posLoc = gl.getAttribLocation(program, 'a_position');
  if (posLoc < 0) return;

  for (let i = 0; i < 8; i++) {
    gl.disableVertexAttribArray(i);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer.buffer);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, quadBuffer.itemSize, quadBuffer.type, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, quadBuffer.numItems);
  gl.disableVertexAttribArray(posLoc);
}

/** Sample center pixel of the trace FBO to validate geometry hits. */
export function sampleTraceHitRatio(gl: WebGL2RenderingContext, state: PathTraceGpuState): number {
  const buf = new Uint8Array(4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, state.lowResFbo);
  gl.readPixels(
    Math.floor(state.lowResWidth / 2),
    Math.floor(state.lowResHeight / 2),
    1,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    buf
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const isSky = buf[0] === 115 && buf[1] === 158 && buf[2] === 224;
  return isSky ? 0 : 1;
}

export function readTraceHitRatio(gl: WebGL2RenderingContext, state: PathTraceGpuState): number {
  const w = state.lowResWidth;
  const h = state.lowResHeight;
  if (w <= 0 || h <= 0) return 0;

  const buf = new Uint8Array(4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, state.lowResFbo);
  gl.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const isSky = buf[0] === 115 && buf[1] === 158 && buf[2] === 224;
  return isSky ? 0 : 1;
}

export interface PathTraceMainBlitState {
  blitProgram: WebGLProgram;
  blitColor: WebGLUniformLocation | null;
  blitKeySky: WebGLUniformLocation | null;
  displayTexture: WebGLTexture;
}

export function createPathTraceMainBlitState(gl: WebGL2RenderingContext): PathTraceMainBlitState {
  const blitProgram = linkProgram(gl, blitVert, blitFrag);
  const displayTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, displayTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return {
    blitProgram,
    blitColor: gl.getUniformLocation(blitProgram, 'u_color'),
    blitKeySky: gl.getUniformLocation(blitProgram, 'u_keySky'),
    displayTexture,
  };
}

export function blitPathTraceFboToPlayfield(
  gl: WebGL2RenderingContext,
  state: PathTraceGpuState,
  layout: { offsetX: number; glY: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  keySky = false,
  preserveLetterbox = false
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvasWidth, canvasHeight);
  if (!preserveLetterbox) {
    gl.clearColor(1.0, 0.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.lowResColor);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.viewport(layout.offsetX, layout.glY, layout.width, layout.height);
  gl.useProgram(state.blitProgram);
  if (state.uniforms.blitColor) {
    gl.uniform1i(state.uniforms.blitColor, 0);
  }
  const keySkyLoc = gl.getUniformLocation(state.blitProgram, 'u_keySky');
  if (keySkyLoc) {
    gl.uniform1f(keySkyLoc, keySky ? 1 : 0);
  }
  drawFullscreenQuad(gl, state.quadBuffer, state.blitProgram);
  gl.viewport(0, 0, canvasWidth, canvasHeight);
}

/** @deprecated Canvas blit forces GPU→CPU sync; use blitPathTraceFboToPlayfield. */
export function blitPathTraceCanvasToPlayfield(
  mainGl: WebGL2RenderingContext,
  blitState: PathTraceMainBlitState,
  quadBuffer: ReturnType<typeof createBuffer>,
  offscreenCanvas: HTMLCanvasElement,
  layout: { offsetX: number; glY: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  keySky = false,
  preserveLetterbox = false
): void {
  mainGl.bindFramebuffer(mainGl.FRAMEBUFFER, null);
  mainGl.viewport(0, 0, canvasWidth, canvasHeight);
  if (!preserveLetterbox) {
    mainGl.clearColor(1.0, 0.0, 1.0, 1.0);
    mainGl.clear(mainGl.COLOR_BUFFER_BIT);
  }

  mainGl.bindTexture(mainGl.TEXTURE_2D, blitState.displayTexture);
  mainGl.texParameteri(mainGl.TEXTURE_2D, mainGl.TEXTURE_MIN_FILTER, mainGl.NEAREST);
  mainGl.texParameteri(mainGl.TEXTURE_2D, mainGl.TEXTURE_MAG_FILTER, mainGl.NEAREST);
  mainGl.texImage2D(
    mainGl.TEXTURE_2D,
    0,
    mainGl.RGBA,
    mainGl.RGBA,
    mainGl.UNSIGNED_BYTE,
    offscreenCanvas
  );

  mainGl.viewport(layout.offsetX, layout.glY, layout.width, layout.height);
  mainGl.useProgram(blitState.blitProgram);
  mainGl.activeTexture(mainGl.TEXTURE0);
  mainGl.bindTexture(mainGl.TEXTURE_2D, blitState.displayTexture);
  if (blitState.blitColor) {
    mainGl.uniform1i(blitState.blitColor, 0);
  }
  if (blitState.blitKeySky) {
    mainGl.uniform1f(blitState.blitKeySky, keySky ? 1 : 0);
  }
  drawFullscreenQuad(mainGl, quadBuffer, blitState.blitProgram);
  mainGl.viewport(0, 0, canvasWidth, canvasHeight);
}

export function uploadPointLights(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  lights: readonly PointLight[]
): number {
  const count = Math.min(lights.length, MAX_PATH_TRACE_POINT_LIGHTS);
  const data = new Float32Array(MAX_PATH_TRACE_POINT_LIGHTS * 2 * 4);
  for (let i = 0; i < count; i++) {
    const light = lights[i]!;
    const base = i * 8;
    data[base] = light.position[0];
    data[base + 1] = light.position[1];
    data[base + 2] = light.position[2];
    data[base + 3] = light.radius;
    data[base + 4] = light.color[0];
    data[base + 5] = light.color[1];
    data[base + 6] = light.color[2];
    data[base + 7] = light.intensity;
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    MAX_PATH_TRACE_POINT_LIGHTS,
    2,
    0,
    gl.RGBA,
    gl.FLOAT,
    data
  );
  return count;
}

export function readCanvasTraceHitRatio(
  offscreenGl: WebGL2RenderingContext,
  width: number,
  height: number
): number {
  const buf = new Uint8Array(4);
  offscreenGl.bindFramebuffer(offscreenGl.FRAMEBUFFER, null);
  offscreenGl.readPixels(Math.floor(width / 2), Math.floor(height / 2), 1, 1, offscreenGl.RGBA, offscreenGl.UNSIGNED_BYTE, buf);
  const isSky = buf[0] === 115 && buf[1] === 158 && buf[2] === 224;
  return isSky ? 0 : 1;
}
