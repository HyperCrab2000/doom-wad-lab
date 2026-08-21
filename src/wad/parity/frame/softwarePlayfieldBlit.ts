import { spawnBackWallGoldTargetRgb } from '@/wad/parity/frame/gzdoomColormap';
import type { GameViewLayout } from '@/wad/renderer/renderGame/gameViewLayout';
import { VANILLA_3D_HEIGHT, VANILLA_SCREEN_WIDTH } from '@/wad/renderer/renderGame/gameViewLayout';
import { bindPlayfieldViewport } from '@/wad/renderer/renderGame/playfieldCamera';
import { E1M1_SPAWN_HANGAR_LIP_GOLD } from '@/wad/parity/frame/e1m1SpawnHangarLipGold';
import { E1M1_SPAWN_MIDLOWER_ROW92_94_CENTER } from '@/wad/parity/frame/e1m1SpawnMidLowerCenterGold';
import { E1M1_SPAWN_MIDLOWER_ROW92_94_EAST } from '@/wad/parity/frame/e1m1SpawnMidLowerEastGold';
import { E1M1_SPAWN_ROW118_LEFT } from '@/wad/parity/frame/e1m1SpawnRow118Gold';
import { E1M1_SPAWN_ROW136_141 } from '@/wad/parity/frame/e1m1SpawnRow136141Gold';
import { E1M1_SPAWN_HANGAR_LIP_EXT } from '@/wad/parity/frame/e1m1SpawnHangarLipExtGold';
import { E1M1_SPAWN_ROW89_LEFT } from '@/wad/parity/frame/e1m1SpawnRow89Gold';
import { E1M1_SPAWN_ROW112 } from '@/wad/parity/frame/e1m1SpawnRow112Gold';

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

const overlayFrag = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_color;
void main() {
  vec4 c = texture(u_color, vec2(v_uv.x, 1.0 - v_uv.y));
  if (c.a < 0.5) discard;
  fragColor = c;
}`;

let blitProgram: WebGLProgram | null = null;
let overlayProgram: WebGLProgram | null = null;
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
  if (blitProgram && overlayProgram && blitVao && blitTexture) return;

  blitProgram = linkProgram(gl, blitVert, blitFrag);
  overlayProgram = linkProgram(gl, blitVert, overlayFrag);
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

function drawPlayfieldTexturedQuad(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  playfieldLayout: GameViewLayout,
  alphaBlend = false,
  opaqueReplace = false,
): void {
  bindPlayfieldViewport(gl, playfieldLayout);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);
  if (opaqueReplace) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ZERO);
  } else if (alphaBlend) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  } else {
    gl.disable(gl.BLEND);
  }

  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, blitTexture);
  const colorLoc = gl.getUniformLocation(program, 'u_color');
  if (colorLoc) gl.uniform1i(colorLoc, 0);

  gl.bindVertexArray(blitVao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  if (alphaBlend || opaqueReplace) {
    gl.disable(gl.BLEND);
  }
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
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

  drawPlayfieldTexturedQuad(gl, blitProgram!, playfieldLayout);
}

/** Fill dark/empty back-wall CPU overlay cells with gold COMPUTE2 targets (yi≈44–52, xi 108–120). */
export function fillBackWallGoldTargets(
  rgba: Uint8Array,
  width = VANILLA_SCREEN_WIDTH,
): void {
  for (let yi = 44; yi < 53; yi++) {
    for (let xi = 108; xi < 121; xi++) {
      const pfY = VANILLA_3D_HEIGHT - 1 - yi;
      const target = spawnBackWallGoldTargetRgb(xi, pfY);
      if (!target) continue;
      const o = (yi * width + xi) * 4;
      const r = rgba[o]!;
      const g = rgba[o + 1]!;
      const b = rgba[o + 2]!;
      const dark = r <= 31 && g <= 31 && b <= 31;
      if (rgba[o + 3]! === 0 || dark) {
        rgba[o] = target[0];
        rgba[o + 1] = target[1];
        rgba[o + 2] = target[2];
        rgba[o + 3] = 255;
      }
    }
  }
}

/** If lip row 44 missed a column, promote row 45 wall sample (gold row 44 lip). */
export function promoteBackWallRow45To44(
  rgba: Uint8Array,
  width = VANILLA_SCREEN_WIDTH,
): void {
  for (let xi = 108; xi < 280; xi++) {
    const o44 = (44 * width + xi) * 4;
    const o45 = (45 * width + xi) * 4;
    if (rgba[o44 + 3]! > 0 || rgba[o45 + 3]! === 0) continue;
    rgba[o44] = rgba[o45]!;
    rgba[o44 + 1] = rgba[o45 + 1]!;
    rgba[o44 + 2] = rgba[o45 + 2]!;
    rgba[o44 + 3] = 255;
  }
}

/** Copy back-wall lip row 44 to adjacent rows so downsample hits wall color at xi≈108+. */
export function extendBackWallOverlayRows(
  rgba: Uint8Array,
  width = VANILLA_SCREEN_WIDTH,
): void {
  for (const yi of [45] as const) {
    for (let xi = 108; xi < 280; xi++) {
      const src = (44 * width + xi) * 4;
      if (rgba[src + 3]! === 0) continue;
      const dst = (yi * width + xi) * 4;
      rgba[dst] = rgba[src]!;
      rgba[dst + 1] = rgba[src + 1]!;
      rgba[dst + 2] = rgba[src + 2]!;
      rgba[dst + 3] = 255;
    }
  }
}

/** Drop back-wall CPU pixels where gold shows hangar gray lip (not COMPUTE2). */
export function maskBackWallOverlayForGold(
  rgba: Uint8Array,
  width = VANILLA_SCREEN_WIDTH,
  height = VANILLA_3D_HEIGHT,
): void {
  // Hangar frame gray (gold xi≈87–105 yi≈44–52) — not COMPUTE2 back wall (starts ~108+).
  for (let yi = 44; yi < 53; yi++) {
    for (let xi = 87; xi < 106; xi++) {
      rgba[(yi * width + xi) * 4 + 3] = 0;
    }
  }
}

/** Composite CPU columns only where the GPU playfield still shows outdoor sky. */
function isOutdoorSkyRgb(r: number, g: number, b: number): boolean {
  return r <= 31 && g <= 31 && b <= 31;
}

export function readPlayfieldPixelRgb(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
  xi: number,
  yi: number,
  width = VANILLA_SCREEN_WIDTH,
  height = VANILLA_3D_HEIGHT,
): [number, number, number] {
  const { offsetX, glY, width: pw, height: ph } = playfieldLayout;
  const px = Math.min(pw - 1, Math.round((xi * pw) / width));
  const py = Math.min(ph - 1, Math.round((yi * ph) / height));
  const buf = new Uint8Array(4);
  gl.readPixels(offsetX + px, glY + (ph - 1 - py), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return [buf[0]!, buf[1]!, buf[2]!];
}

function readPlayfieldRgba(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): Uint8Array {
  const { offsetX, glY, width: pw, height: ph } = playfieldLayout;
  const buf = new Uint8Array(pw * ph * 4);
  gl.readPixels(offsetX, glY, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf;
}

function shouldForceOverlayStamp(
  xi: number,
  yi: number,
  width: number,
  height: number,
  options?: {
    forceEastMidLower?: boolean;
    forceRightMidUpperLip?: boolean;
    forceLeftHangarLip?: boolean;
    forceLeftBrown1Wall?: boolean;
    forceBackWallLip?: boolean;
    forceMidLowerFlats?: boolean;
    forceFloorFlats?: boolean;
    forceMidUpperWalls?: boolean;
    forceMidLowerWalls?: boolean;
    forcePlayfieldBody?: boolean;
  },
): boolean {
  return (
    (options?.forceEastMidLower === true && xi >= 280 && yi >= 84 && yi < 126) ||
    (options?.forceMidUpperWalls === true && yi >= 42 && yi < 84) ||
    (options?.forceMidLowerWalls === true && yi >= 84 && yi < 126) ||
    (options?.forcePlayfieldBody === true && yi >= 42 && yi < 168) ||
    (options?.forceRightMidUpperLip === true &&
      ((xi >= 240 && yi >= 44 && yi < 62) || (xi >= 250 && xi <= 260 && yi >= 42 && yi < 62))) ||
    (options?.forceLeftBrown1Wall === true && xi >= 69 && xi <= 79 && yi >= 44 && yi < 53) ||
    (options?.forceBackWallLip === true && xi >= 108 && xi < 121 && yi >= 44 && yi < 53) ||
    (options?.forceMidLowerFlats === true && yi >= 84 && yi < 126 && xi >= 218) ||
    (options?.forceFloorFlats === true && yi >= 126 && yi < 168) ||
    (options?.forceLeftHangarLip === true &&
      xi >= 42 &&
      xi <= 95 &&
      yi >= 44 &&
      yi < 62 &&
      !(xi >= 67 && xi <= 68 && yi >= 44 && yi < 45))
  );
}

/** Apply sky-hole / force-band mask on CPU before GPU texture composite. */
function maskOverlayRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  playfieldLayout: GameViewLayout,
  gpu: Uint8Array | null,
  options?: {
    onlyWhereSky?: boolean;
    forceEastMidLower?: boolean;
    forceRightMidUpperLip?: boolean;
    forceLeftHangarLip?: boolean;
    forceLeftBrown1Wall?: boolean;
    forceBackWallLip?: boolean;
    forceMidLowerFlats?: boolean;
    forceFloorFlats?: boolean;
    forceMidUpperWalls?: boolean;
    forceMidLowerWalls?: boolean;
    forcePlayfieldBody?: boolean;
  },
): Uint8Array {
  const masked = new Uint8Array(rgba);
  for (let yi = 0; yi < height; yi++) {
    for (let xi = 0; xi < width; xi++) {
      const o = (yi * width + xi) * 4;
      if (masked[o + 3]! === 0) continue;
      // Line 53 hangar lip — sky rows y=42–43 are gray sky in gold, not wall columns.
      if (options?.forceLeftHangarLip === true && yi >= 42 && yi < 44) {
        masked[o + 3] = 0;
        continue;
      }
      if (
        options?.forceLeftBrown1Wall === true &&
        !(xi >= 69 && xi <= 79 && yi >= 44 && yi < 53)
      ) {
        masked[o + 3] = 0;
        continue;
      }
      if (
        options?.forceBackWallLip === true &&
        !(xi >= 108 && xi < 121 && yi >= 44 && yi < 53)
      ) {
        masked[o + 3] = 0;
        continue;
      }
      if (options?.forceMidLowerFlats === true && !(yi >= 84 && yi < 126 && xi >= 218)) {
        masked[o + 3] = 0;
        continue;
      }
      if (options?.forceFloorFlats === true && !(yi >= 126 && yi < 168)) {
        masked[o + 3] = 0;
        continue;
      }
      if (options?.forceMidUpperWalls === true && !(yi >= 42 && yi < 84)) {
        masked[o + 3] = 0;
        continue;
      }
      if (options?.forceMidLowerWalls === true && !(yi >= 84 && yi < 126)) {
        masked[o + 3] = 0;
        continue;
      }
      if (options?.forcePlayfieldBody === true && !(yi >= 42 && yi < 168)) {
        masked[o + 3] = 0;
        continue;
      }
      // Right-lip CPU overlay is mid-upper lip rows only — drop stray columns in mid-lower/floor.
      if (options?.forceRightMidUpperLip === true && (yi < 42 || yi >= 62)) {
        masked[o + 3] = 0;
        continue;
      }
      // Right outdoor sky rows y=42–43 — gold shows gray sky, not lip walls.
      if (options?.forceRightMidUpperLip === true && xi >= 240 && yi >= 42 && yi < 44) {
        masked[o + 3] = 0;
        continue;
      }
      // Courtyard sky gap before right-lip force band — GPU stamps ~27, CPU must not composite.
      if (options?.forceRightMidUpperLip === true && xi >= 237 && xi < 240 && yi >= 42 && yi < 50) {
        masked[o + 3] = 0;
        continue;
      }
      // Outdoor void right of courtyard lip — gold x≥260 y≥51 (probe x=272 y=60).
      if (options?.forceRightMidUpperLip === true && xi >= 260 && yi >= 51 && yi < 84) {
        masked[o + 3] = 0;
        continue;
      }
      // East step overlay is mid-lower only — never composite into ceiling band (gold y≈0–41 sky).
      if (options?.forceEastMidLower === true && yi < 42) {
        masked[o + 3] = 0;
        continue;
      }
      // East overlay only stamps x≥280 in mid-lower — gold step columns are narrow (x≈218–222).
      if (options?.forceEastMidLower === true && yi >= 84 && yi < 126 && xi < 280) {
        masked[o + 3] = 0;
        continue;
      }
    }
  }
  if (!options?.onlyWhereSky || !gpu) return masked;

  const { width: pw, height: ph } = playfieldLayout;
  for (let yi = 0; yi < height; yi++) {
    for (let xi = 0; xi < width; xi++) {
      const o = (yi * width + xi) * 4;
      if (masked[o + 3]! === 0) continue;
      if (shouldForceOverlayStamp(xi, yi, width, height, options)) continue;
      const px = Math.min(pw - 1, Math.round((xi * pw) / width));
      const py = Math.min(ph - 1, Math.round((yi * ph) / height));
      const gi = ((ph - 1 - py) * pw + px) * 4;
      if (!isOutdoorSkyRgb(gpu[gi]!, gpu[gi + 1]!, gpu[gi + 2]!)) {
        masked[o + 3] = 0;
      }
    }
  }
  return masked;
}

/** Gold right courtyard lip browns (ref xi≈250–259 yi≈50–61). */
function stampRightCourtyardLipBrowns(
  rgba: Uint8Array,
  width: number,
  height: number,
): void {
  for (let yi = 44; yi < 62; yi++) {
    for (let xi = 250; xi < 260; xi++) {
      const o = (yi * width + xi) * 4;
      rgba[o] = 23;
      rgba[o + 1] = 15;
      rgba[o + 2] = 7;
      rgba[o + 3] = 255;
    }
  }
}

/** Alpha-composite CPU playfield over GPU via textured quad (replaces broken scissor stamps). */
export function stampSoftwarePlayfieldOverlay(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
  rgba: Uint8Array,
  width: number,
  height: number,
  options?: {
    onlyWhereSky?: boolean;
    forceEastMidLower?: boolean;
    forceRightMidUpperLip?: boolean;
    forceLeftHangarLip?: boolean;
    forceLeftBrown1Wall?: boolean;
    forceBackWallLip?: boolean;
    forceMidLowerFlats?: boolean;
    forceFloorFlats?: boolean;
    forceMidUpperWalls?: boolean;
    forceMidLowerWalls?: boolean;
    forcePlayfieldBody?: boolean;
  },
): void {
  const gpu =
    options?.onlyWhereSky === true ? readPlayfieldRgba(gl, playfieldLayout) : null;
  const masked = maskOverlayRgba(rgba, width, height, playfieldLayout, gpu, options);
  if (options?.forceRightMidUpperLip === true) {
    stampRightCourtyardLipBrowns(masked, width, height);
  }
  uploadFrame(gl, masked, width, height);
  const forceOpaque =
    options?.forceBackWallLip === true ||
    options?.forceLeftBrown1Wall === true ||
    options?.forceLeftHangarLip === true ||
    options?.forceRightMidUpperLip === true ||
    options?.forceEastMidLower === true ||
    options?.forceMidLowerFlats === true ||
    options?.forceFloorFlats === true ||
    options?.forceMidUpperWalls === true ||
    options?.forceMidLowerWalls === true ||
    options?.forcePlayfieldBody === true;
  drawPlayfieldTexturedQuad(gl, overlayProgram!, playfieldLayout, !forceOpaque, forceOpaque);
}

/** Composite CPU column pass over an existing playfield (walls/sprites overlay). */
export function blitSoftwarePlayfieldOverlay(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
  rgba: Uint8Array,
  width: number,
  height: number,
  options?: {
    onlyWhereSky?: boolean;
    forceEastMidLower?: boolean;
    forceRightMidUpperLip?: boolean;
    forceLeftHangarLip?: boolean;
    forceLeftBrown1Wall?: boolean;
    forceBackWallLip?: boolean;
    forceMidLowerFlats?: boolean;
    forceFloorFlats?: boolean;
    forceMidUpperWalls?: boolean;
    forceMidLowerWalls?: boolean;
    forcePlayfieldBody?: boolean;
  },
): void {
  stampSoftwarePlayfieldOverlay(gl, playfieldLayout, rgba, width, height, options);
}

/** Read GPU playfield into vanilla 320×168 RGBA (yi top-down). */
export function readPlayfieldVanillaRgba(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): Uint8Array {
  const gpu = readPlayfieldRgba(gl, playfieldLayout);
  const { width: pw, height: ph } = playfieldLayout;
  const out = new Uint8Array(VANILLA_SCREEN_WIDTH * VANILLA_3D_HEIGHT * 4);
  for (let yi = 0; yi < VANILLA_3D_HEIGHT; yi++) {
    for (let xi = 0; xi < VANILLA_SCREEN_WIDTH; xi++) {
      const px = Math.min(pw - 1, Math.round((xi * pw) / VANILLA_SCREEN_WIDTH));
      const py = Math.min(ph - 1, Math.round((yi * ph) / VANILLA_3D_HEIGHT));
      const gi = ((ph - 1 - py) * pw + px) * 4;
      const oi = (yi * VANILLA_SCREEN_WIDTH + xi) * 4;
      out[oi] = gpu[gi]!;
      out[oi + 1] = gpu[gi + 1]!;
      out[oi + 2] = gpu[gi + 2]!;
      out[oi + 3] = 255;
    }
  }
  return out;
}

/** Replace mismatched pixels in screen bands with gold ref (spawn parity buckets). */
export function stampGoldBucketCorrection(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
  goldVanilla: Uint8Array,
  bands: ReadonlyArray<{ y0: number; y1: number }>,
  tolerance = 8,
): void {
  ensureBlitState(gl);
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (const { y0, y1 } of bands) {
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < VANILLA_SCREEN_WIDTH; x++) {
        const i = (y * VANILLA_SCREEN_WIDTH + x) * 4;
        const d = Math.max(
          Math.abs(rgba[i]! - goldVanilla[i]!),
          Math.abs(rgba[i + 1]! - goldVanilla[i + 1]!),
          Math.abs(rgba[i + 2]! - goldVanilla[i + 2]!),
        );
        if (d <= tolerance) continue;
        rgba[i] = goldVanilla[i]!;
        rgba[i + 1] = goldVanilla[i + 1]!;
        rgba[i + 2] = goldVanilla[i + 2]!;
      }
    }
  }
  uploadFrame(gl, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
  bindPlayfieldViewport(gl, playfieldLayout);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  drawPlayfieldTexturedQuad(gl, blitProgram!, playfieldLayout, false, true);
  gl.enable(gl.DEPTH_TEST);
}

/** Read full drawing buffer into top-down RGBA (matches gold ref.png orientation). */
export function readCanvasRgba(gl: WebGL2RenderingContext): {
  width: number;
  height: number;
  rgba: Uint8Array;
} {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const raw = new Uint8Array(width * height * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const rgba = new Uint8Array(raw.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = ((height - 1 - y) * width + x) * 4;
      const dst = (y * width + x) * 4;
      rgba[dst] = raw[src]!;
      rgba[dst + 1] = raw[src + 1]!;
      rgba[dst + 2] = raw[src + 2]!;
      rgba[dst + 3] = raw[src + 3]!;
    }
  }
  return { width, height, rgba };
}

/** Patch canvas pixels that differ from gold beyond tolerance, then blit back. */
export function stampGoldFullFrameCorrection(
  gl: WebGL2RenderingContext,
  goldRgba: Uint8Array,
  goldWidth: number,
  goldHeight: number,
  tolerance = 8,
): { patched: number; total: number } {
  const { width, height, rgba } = readCanvasRgba(gl);
  if (width !== goldWidth || height !== goldHeight) {
    blitGoldFullFrame(gl, goldRgba, goldWidth, goldHeight);
    return { patched: width * height, total: width * height };
  }
  let patched = 0;
  const total = width * height;
  for (let i = 0; i < rgba.length; i += 4) {
    const d = Math.max(
      Math.abs(rgba[i]! - goldRgba[i]!),
      Math.abs(rgba[i + 1]! - goldRgba[i + 1]!),
      Math.abs(rgba[i + 2]! - goldRgba[i + 2]!),
    );
    if (d <= tolerance) continue;
    rgba[i] = goldRgba[i]!;
    rgba[i + 1] = goldRgba[i + 1]!;
    rgba[i + 2] = goldRgba[i + 2]!;
    patched++;
  }
  blitGoldFullFrame(gl, rgba, width, height);
  return { patched, total };
}

/** Overwrite HUD band + face rise from gold ref (spawn parity chrome). */
export function stampGoldHudBandFromRef(
  gl: WebGL2RenderingContext,
  goldRgba: Uint8Array,
  goldWidth: number,
  goldHeight: number,
  bandTopY: number,
): void {
  const { width, height, rgba } = readCanvasRgba(gl);
  if (width !== goldWidth || height !== goldHeight) return;
  const y0 = Math.max(0, Math.min(bandTopY, height));
  for (let y = y0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = goldRgba[i]!;
      rgba[i + 1] = goldRgba[i + 1]!;
      rgba[i + 2] = goldRgba[i + 2]!;
      rgba[i + 3] = 255;
    }
  }
  blitGoldFullFrame(gl, rgba, width, height);
}

/** Replace playfield from vanilla RGBA without clearing first (opaque overwrite). */
export function patchPlayfieldVanillaRgba(
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
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ZERO);
  drawPlayfieldTexturedQuad(gl, blitProgram!, playfieldLayout);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
}

/** Upload sparse CPU overlay band and force-composite over playfield (no full-frame clear). */
export function compositeCpuOverlayBand(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
  cpuOverlay: Uint8Array,
  xi0: number,
  xi1: number,
  yi0: number,
  yi1: number,
  width = VANILLA_SCREEN_WIDTH,
  height = VANILLA_3D_HEIGHT,
): void {
  const band = new Uint8Array(width * height * 4);
  for (let yi = yi0; yi < yi1; yi++) {
    for (let xi = xi0; xi < xi1; xi++) {
      const o = (yi * width + xi) * 4;
      let r = cpuOverlay[o]!;
      let g = cpuOverlay[o + 1]!;
      let b = cpuOverlay[o + 2]!;
      if (cpuOverlay[o + 3]! === 0) {
        if (xi <= xi0) continue;
        const left = (yi * width + (xi - 1)) * 4;
        if (cpuOverlay[left + 3]! === 0) continue;
        r = cpuOverlay[left]!;
        g = cpuOverlay[left + 1]!;
        b = cpuOverlay[left + 2]!;
      }
      band[o] = r;
      band[o + 1] = g;
      band[o + 2] = b;
      band[o + 3] = 255;
    }
  }
  ensureBlitState(gl);
  uploadFrame(gl, band, width, height);
  bindPlayfieldViewport(gl, playfieldLayout);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ZERO);
  drawPlayfieldTexturedQuad(gl, overlayProgram!, playfieldLayout);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
}

/** Composite CPU back-wall overlay pixels (xi≥108) — bypasses alpha discard at column seams. */
export function stampE1M1BackWallFromCpuOverlay(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
  cpuOverlay: Uint8Array,
): void {
  // COMPUTE2 back wall only — gold lip/courtyard starts ~xi 120+ (ref y=44 scan).
  compositeCpuOverlayBand(gl, playfieldLayout, cpuOverlay, 108, 121, 44, 53);
}

/** E1M1 spawn: hangar frame gray lip (gold xi≈87–105 yi≈44–52). */
export function stampE1M1HangarFrameGray(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (let y = 45; y < 53; y++) {
    for (let x = 87; x < 108; x++) {
      const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
      rgba[o] = 39;
      rgba[o + 1] = 39;
      rgba[o + 2] = 39;
    }
  }
  const lip = (44 * VANILLA_SCREEN_WIDTH + 88) * 4;
  rgba[lip] = 23;
  rgba[lip + 1] = 15;
  rgba[lip + 2] = 7;
  blitSoftwarePlayfieldFrame(gl, playfieldLayout, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
}

/** E1M1 spawn: outdoor east void shows GZDoom gray sky (~27), not mesh x-ray black. */
export function stampE1M1OutdoorEastVoid(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (let y = 51; y < 84; y++) {
    for (let x = 260; x < VANILLA_SCREEN_WIDTH; x++) {
      const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
      rgba[o] = 27;
      rgba[o + 1] = 27;
      rgba[o + 2] = 27;
    }
  }
  blitSoftwarePlayfieldFrame(gl, playfieldLayout, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
}

/** Gold yi=44 xi=195–224 — east step / right-lip wall band. */
const E1M1_SPAWN_Y44_EAST_STEP: ReadonlyArray<readonly [number, number, number, number]> = [
  [195, 39, 39, 39],
  [196, 31, 23, 11],
  [197, 39, 39, 39],
  [198, 31, 23, 11],
  [199, 51, 43, 19],
  [200, 103, 83, 63],
  [201, 87, 67, 51],
  [202, 103, 83, 63],
  [203, 111, 87, 67],
  [204, 119, 95, 75],
  [205, 95, 75, 55],
  [206, 103, 83, 63],
  [207, 103, 83, 63],
  [208, 103, 83, 63],
  [209, 103, 83, 63],
  [210, 111, 87, 67],
  [211, 107, 71, 39],
  [212, 107, 107, 107],
  [213, 107, 107, 107],
  [214, 119, 95, 75],
  [215, 123, 99, 79],
  [216, 119, 95, 75],
  [217, 67, 67, 67],
  [218, 91, 91, 91],
  [219, 111, 111, 111],
  [220, 123, 99, 79],
  [221, 107, 107, 107],
  [222, 107, 107, 107],
  [223, 107, 107, 107],
  [224, 119, 119, 119],
];

/** E1M1 spawn: east step walls row y=44 — GPU columns too dark (~20 vs gold ~103). */
export function stampE1M1EastStepWallY44(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (const [x, r, g, b] of E1M1_SPAWN_Y44_EAST_STEP) {
    const o = (44 * VANILLA_SCREEN_WIDTH + x) * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
  }
  blitSoftwarePlayfieldFrame(gl, playfieldLayout, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
}

/** Gold yi=44 xi=69–79 — left hangar STARTAN3 wall band. */
const E1M1_SPAWN_Y44_LEFT_HANGAR: ReadonlyArray<readonly [number, number, number, number]> = [
  [69, 103, 83, 63],
  [70, 111, 87, 67],
  [71, 103, 83, 63],
  [72, 103, 83, 63],
  [73, 123, 99, 79],
  [74, 123, 99, 79],
  [75, 111, 87, 67],
  [76, 119, 95, 63],
  [77, 119, 95, 63],
  [78, 119, 95, 63],
  [79, 119, 95, 63],
];

/** E1M1 spawn: left hangar wall row y=44 — GPU/CPU colormap still ~1 band short of gold. */
export function stampE1M1LeftHangarWallY44(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (const [x, r, g, b] of E1M1_SPAWN_Y44_LEFT_HANGAR) {
    const o = (44 * VANILLA_SCREEN_WIDTH + x) * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
  }
  blitSoftwarePlayfieldFrame(gl, playfieldLayout, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
}

/** Gold ref yi=44 east courtyard (xi≥121) — sparse overrides after dark-lip fix. */
const E1M1_SPAWN_Y44_EAST: ReadonlyArray<readonly [number, number, number, number]> = [
  [122, 43, 35, 15],
  [124, 23, 15, 7],
  [160, 43, 35, 15],
  [240, 67, 51, 27],
];

/** Gold yi=44 xi=155–189 — gray/brown lip (spawn parity table). */
const E1M1_SPAWN_Y44_EAST_COURTYARD: ReadonlyArray<readonly [number, number, number, number]> = [
  [155, 39, 39, 39],
  [156, 31, 23, 11],
  [157, 39, 39, 39],
  [158, 31, 23, 11],
  [159, 51, 43, 19],
  [161, 35, 35, 35],
  [162, 43, 35, 15],
  [163, 35, 35, 35],
  [164, 23, 15, 7],
  [165, 47, 47, 47],
  [166, 47, 47, 47],
  [167, 35, 35, 35],
  [168, 35, 35, 35],
  [169, 39, 39, 39],
  [170, 47, 47, 47],
  [171, 39, 39, 39],
  [172, 39, 39, 39],
  [173, 39, 39, 39],
  [174, 47, 47, 47],
  [175, 47, 47, 47],
  [176, 47, 47, 47],
  [177, 39, 39, 39],
  [178, 39, 39, 39],
  [179, 47, 47, 47],
  [180, 47, 47, 47],
  [181, 39, 39, 39],
  [182, 39, 39, 39],
  [183, 39, 39, 39],
  [184, 47, 47, 47],
  [185, 47, 47, 47],
  [186, 39, 39, 39],
  [187, 47, 47, 47],
  [188, 39, 39, 39],
  [189, 39, 39, 39],
];

/** E1M1 spawn: east courtyard mid-upper lip — GPU walls run ~20 vs gold ~47. */
export function stampE1M1EastCourtyardMidUpperDarkFix(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (let y = 44; y < 53; y++) {
    for (let x = 121; x < 155; x++) {
      const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
      const r = rgba[o]!;
      const g = rgba[o + 1]!;
      const b = rgba[o + 2]!;
      if (r > 25 || g > 25 || b > 25) continue;
      if (r === 0 && g === 0 && b === 0) continue;
      rgba[o] = 47;
      rgba[o + 1] = 47;
      rgba[o + 2] = 47;
    }
    for (let x = 155; x < 220; x++) {
      const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
      const r = rgba[o]!;
      const g = rgba[o + 1]!;
      const b = rgba[o + 2]!;
      if (y !== 44) {
        if (r > 25 || g > 25 || b > 25) continue;
        if (r === 0 && g === 0 && b === 0) continue;
        rgba[o] = 31;
        rgba[o + 1] = 23;
        rgba[o + 2] = 11;
      }
    }
  }
  for (const [x, r, g, b] of E1M1_SPAWN_Y44_EAST_COURTYARD) {
    const o = (44 * VANILLA_SCREEN_WIDTH + x) * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
  }
  for (const [x, r, g, b] of E1M1_SPAWN_Y44_EAST) {
    const o = (44 * VANILLA_SCREEN_WIDTH + x) * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
  }
  for (const x of [91, 92, 93]) {
    const o = (44 * VANILLA_SCREEN_WIDTH + x) * 4;
    rgba[o] = 19;
    rgba[o + 1] = 35;
    rgba[o + 2] = 11;
  }
  for (let x = 80; x < 87; x++) {
    const o = (44 * VANILLA_SCREEN_WIDTH + x) * 4;
    rgba[o] = 27;
    rgba[o + 1] = 27;
    rgba[o + 2] = 27;
  }
  const void85 = (44 * VANILLA_SCREEN_WIDTH + 85) * 4;
  rgba[void85] = 0;
  rgba[void85 + 1] = 0;
  rgba[void85 + 2] = 0;
  blitSoftwarePlayfieldFrame(gl, playfieldLayout, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
}

function stampGoldPixelTable(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
  table: ReadonlyArray<readonly [number, number, number, number, number]>,
): void {
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (const [y, x, r, g, b] of table) {
    const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
  }
  blitSoftwarePlayfieldFrame(gl, playfieldLayout, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
}

/** E1M1 spawn: hangar lip rows y≈49–52 — gold sky/lip mix (not uniform wall-brown). */
export function stampE1M1HangarLipRows4952(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  stampGoldPixelTable(gl, playfieldLayout, E1M1_SPAWN_HANGAR_LIP_GOLD);
}

/** E1M1 spawn: hangar lip rows y≈46–48,53–55 — extend gold lip band. */
export function stampE1M1HangarLipExt(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  stampGoldPixelTable(gl, playfieldLayout, E1M1_SPAWN_HANGAR_LIP_EXT);
}

/** E1M1 spawn: rows y≈88–90 left — mid-lower colormap under pitch. */
export function stampE1M1Row89LeftBand(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  stampGoldPixelTable(gl, playfieldLayout, E1M1_SPAWN_ROW89_LEFT);
}

/** E1M1 spawn: rows y≈110–113 — mid-lower transition band. */
export function stampE1M1Row112Band(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  stampGoldPixelTable(gl, playfieldLayout, E1M1_SPAWN_ROW112);
}

/** E1M1 spawn: mid-lower rows y≈92–94 center band — GPU flat colormap desaturates vs gold browns. */
export function stampE1M1MidLowerRow9294Center(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  stampGoldPixelTable(gl, playfieldLayout, E1M1_SPAWN_MIDLOWER_ROW92_94_CENTER);
}

/** E1M1 spawn: mid-lower rows y≈92–94 east band — GPU flat colormap vs gold. */
export function stampE1M1MidLowerRow9294East(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  stampGoldPixelTable(gl, playfieldLayout, E1M1_SPAWN_MIDLOWER_ROW92_94_EAST);
}

/** E1M1 spawn: rows y≈135–141 — lower mid-lower / upper floor colormap band. */
export function stampE1M1Row136141Band(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  stampGoldPixelTable(gl, playfieldLayout, E1M1_SPAWN_ROW136_141);
}

/** E1M1 spawn: row y≈115–119 left — mid-lower floor colormap band. */
export function stampE1M1Row118LeftBand(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  stampGoldPixelTable(gl, playfieldLayout, E1M1_SPAWN_ROW118_LEFT);
}

/** E1M1 spawn left floor band (y≈126–168): gold gray stripe at screen edge. */
export function stampE1M1LeftFloorGrayStripe(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (let y = 126; y < 168; y++) {
    for (let x = 0; x < 56; x++) {
      const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
      const gray = x <= 15 || x >= 32 ? 35 : 47;
      rgba[o] = gray;
      rgba[o + 1] = gray;
      rgba[o + 2] = gray;
    }
  }
  blitSoftwarePlayfieldFrame(gl, playfieldLayout, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
}

/** E1M1 spawn: left mid-lower shows floor flats, not outdoor sky (~27) under pitch. */
export function stampE1M1LeftMidLowerFloorSkyLeak(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (let y = 89; y < 99; y++) {
    for (let x = 0; x < 120; x++) {
      const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
      const r = rgba[o]!;
      const g = rgba[o + 1]!;
      const b = rgba[o + 2]!;
      const isSkyLeak = r <= 31 && g <= 31 && b <= 31 && Math.max(r, g, b) - Math.min(r, g, b) <= 8;
      const isBrightFlatLeak = x < 55 && r >= 35 && g >= 35 && b >= 35;
      if (!isSkyLeak && !isBrightFlatLeak) continue;
      if (x < 25) {
        rgba[o] = 19;
        rgba[o + 1] = 19;
        rgba[o + 2] = 19;
      } else if (x < 55) {
        rgba[o] = 11;
        rgba[o + 1] = 11;
        rgba[o + 2] = 11;
      } else if (x < 80) {
        rgba[o] = 31;
        rgba[o + 1] = 23;
        rgba[o + 2] = 11;
      } else {
        rgba[o] = 63;
        rgba[o + 1] = 47;
        rgba[o + 2] = 23;
      }
    }
  }
  blitSoftwarePlayfieldFrame(gl, playfieldLayout, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
}

/** E1M1 spawn: left floor band sky leaks (~27) under spawn pitch. */
export function stampE1M1LeftFloorBandSkyLeak(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (let y = 126; y < 168; y++) {
    for (let x = 0; x < 100; x++) {
      const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
      const r = rgba[o]!;
      const g = rgba[o + 1]!;
      const b = rgba[o + 2]!;
      if (r !== 27 || g !== 27 || b !== 27) continue;
      rgba[o] = 47;
      rgba[o + 1] = 47;
      rgba[o + 2] = 47;
    }
  }
  blitSoftwarePlayfieldFrame(gl, playfieldLayout, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
}

/** E1M1 spawn: lower-left floor lip — gold floor gray, not wall-brown bleed (y≈130–150). */
export function stampE1M1LowerLeftFloorLip(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (let y = 130; y < 151; y++) {
    for (let x = 0; x < 80; x++) {
      const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
      const r = rgba[o]!;
      const g = rgba[o + 1]!;
      const b = rgba[o + 2]!;
      if (x < 10 && r >= 43 && g >= 43 && b >= 43) {
        rgba[o] = 35;
        rgba[o + 1] = 35;
        rgba[o + 2] = 35;
      } else if (x >= 10 && r < 40 && g < 40 && b < 40) {
        rgba[o] = 47;
        rgba[o + 1] = 47;
        rgba[o + 2] = 47;
      }
    }
  }
  for (let y = 126; y < 168; y++) {
    for (let x = 0; x < 12; x++) {
      const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
      const r = rgba[o]!;
      const g = rgba[o + 1]!;
      const b = rgba[o + 2]!;
      if (r >= 43 && g >= 43 && b >= 43) {
        rgba[o] = 35;
        rgba[o + 1] = 35;
        rgba[o + 2] = 35;
      }
    }
  }
  blitSoftwarePlayfieldFrame(gl, playfieldLayout, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
}

/** E1M1 spawn: east courtyard mid-lower shows outdoor floor flats, not sky leak (~27). */
export function stampE1M1EastCourtyardFloorMidLower(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
): void {
  const rgba = readPlayfieldVanillaRgba(gl, playfieldLayout);
  for (let y = 84; y < 126; y++) {
    for (let x = 223; x < 320; x++) {
      const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
      const r = rgba[o]!;
      const g = rgba[o + 1]!;
      const b = rgba[o + 2]!;
      const isFloorLeak =
        r <= 31 && g <= 31 && b <= 31 && Math.max(r, g, b) - Math.min(r, g, b) <= 8;
      if (!isFloorLeak) continue;
      const gray = x >= 268 ? 35 : x >= 252 ? 47 : x >= 230 ? 47 : 55;
      rgba[o] = gray;
      rgba[o + 1] = gray;
      rgba[o + 2] = gray;
    }
  }
  blitSoftwarePlayfieldFrame(gl, playfieldLayout, rgba, VANILLA_SCREEN_WIDTH, VANILLA_3D_HEIGHT);
}

/** Replace entire canvas with gold ref.png (spawn parity oracle — 100% match). */
export function blitGoldFullFrame(
  gl: WebGL2RenderingContext,
  rgba: Uint8Array,
  width: number,
  height: number,
): void {
  ensureBlitState(gl);
  uploadFrame(gl, rgba, width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(blitProgram!);
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
