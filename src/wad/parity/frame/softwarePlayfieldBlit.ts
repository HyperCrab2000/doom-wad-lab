import type { GameViewLayout } from '@/wad/renderer/renderGame/gameViewLayout';
import { bindPlayfieldViewport } from '@/wad/renderer/renderGame/playfieldCamera';

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
void main() {
  fragColor = texture(u_color, vec2(v_uv.x, 1.0 - v_uv.y));
}`;

let blitProgram: WebGLProgram | null = null;
let blitVao: WebGLVertexArrayObject | null = null;
let blitTexture: WebGLTexture | null = null;
let blitTextureSize = { w: 0, h: 0 };

function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, vert);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(vs) ?? 'vertex compile failed');
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, frag);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(fs) ?? 'fragment compile failed');
  }

  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) ?? 'link failed');
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function ensureBlitState(gl: WebGL2RenderingContext): void {
  if (blitProgram && blitVao && blitTexture) return;

  blitProgram = linkProgram(gl, blitVert, blitFrag);
  blitVao = gl.createVertexArray()!;
  const vbo = gl.createBuffer()!;
  gl.bindVertexArray(blitVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(blitProgram, 'a_position');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  blitTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, blitTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function uploadFrame(gl: WebGL2RenderingContext, rgba: Uint8Array, width: number, height: number): void {
  ensureBlitState(gl);
  gl.bindTexture(gl.TEXTURE_2D, blitTexture);
  if (blitTextureSize.w !== width || blitTextureSize.h !== height) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    blitTextureSize = { w: width, h: height };
  } else {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function blitSoftwarePlayfieldFrame(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
  rgba: Uint8Array,
  width: number,
  height: number,
): void {
  ensureBlitState(gl);
  uploadFrame(gl, rgba, width, height);

  bindPlayfieldViewport(gl, playfieldLayout);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(blitProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, blitTexture);
  const colorLoc = gl.getUniformLocation(blitProgram!, 'u_color');
  if (colorLoc) gl.uniform1i(colorLoc, 0);

  gl.bindVertexArray(blitVao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.enable(gl.DEPTH_TEST);
}
