import { VOXEL_HEIGHT_ROOT } from '@/config/doomAssets';

const heightUrlMissCache = new Set<string>();
const MAX_PROC_WALL = 96;
const MAX_PROC_FLAT = 48;

function getVoxelHeightUrl(textureName: string, kind: 'walls' | 'flats'): string {
  return `${VOXEL_HEIGHT_ROOT}/${kind}/${textureName.toUpperCase()}.png`;
}

export interface HeightTextureSet {
  walls: Record<string, WebGLTexture>;
  flats: Record<string, WebGLTexture>;
  fallback: WebGLTexture;
  /** Textures with VoxelDoom-authored height PNGs. */
  loadedWalls: ReadonlySet<string>;
  loadedFlats: ReadonlySet<string>;
  /** Textures that should receive parallax relief in shaders. */
  reliefWalls: ReadonlySet<string>;
  reliefFlats: ReadonlySet<string>;
}

export interface HeightTextureSources {
  wallCanvases?: Record<string, CanvasImageSource | undefined>;
  flatCanvases?: Record<string, CanvasImageSource | undefined>;
  wallSizes?: Record<string, { width: number; height: number } | undefined>;
}

function normalizeTextureName(name: string): string {
  return name.toUpperCase();
}

export function propagateWallHeightRelief(
  set: HeightTextureSet,
  animatedTextures: Record<string, string[]>
): void {
  const reliefWalls = set.reliefWalls as Set<string>;
  const loadedWalls = set.loadedWalls as Set<string>;

  for (const names of Object.values(animatedTextures)) {
    const group = [...new Set(names.map(normalizeTextureName))];
    const donor = group.find((name) => reliefWalls.has(name));
    if (!donor) continue;

    for (const name of group) {
      if (reliefWalls.has(name)) continue;
      set.walls[name] = set.walls[donor];
      reliefWalls.add(name);
      if (loadedWalls.has(donor)) {
        loadedWalls.add(name);
      }
    }
  }
}

export async function createHeightTextureSet(
  gl: WebGL2RenderingContext,
  wallNames: string[],
  flatNames: string[],
  sources: HeightTextureSources = {}
): Promise<HeightTextureSet> {
  const fallback = createSolidHeightTexture(gl, 128);
  const walls: Record<string, WebGLTexture> = Object.create(null);
  const flats: Record<string, WebGLTexture> = Object.create(null);
  const loadedWalls = new Set<string>();
  const loadedFlats = new Set<string>();
  const reliefWalls = new Set<string>();
  const reliefFlats = new Set<string>();

  await Promise.all([
    ...wallNames.map(async (name) => {
      const key = normalizeTextureName(name);
      const size = sources.wallSizes?.[name] ?? sources.wallSizes?.[key];
      const width = size?.width ?? 128;
      const height = size?.height ?? 128;
      const result = await resolveHeightTexture(
        gl,
        getVoxelHeightUrl(key, 'walls'),
        sources.wallCanvases?.[name] ?? sources.wallCanvases?.[key],
        width,
        height,
        fallback,
        'wall'
      );
      walls[key] = result.texture;
      walls[name] = result.texture;
      if (result.fromVoxel) loadedWalls.add(key);
      if (result.hasRelief) {
        reliefWalls.add(key);
        reliefWalls.add(name);
      }
    }),
    ...flatNames.map(async (name) => {
      const key = normalizeTextureName(name);
      const result = await resolveHeightTexture(
        gl,
        getVoxelHeightUrl(key, 'flats'),
        sources.flatCanvases?.[name] ?? sources.flatCanvases?.[key],
        64,
        64,
        fallback,
        'flat'
      );
      flats[key] = result.texture;
      flats[name] = result.texture;
      if (result.fromVoxel) loadedFlats.add(key);
      if (result.hasRelief) {
        reliefFlats.add(key);
        reliefFlats.add(name);
      }
    }),
  ]);

  return { walls, flats, fallback, loadedWalls, loadedFlats, reliefWalls, reliefFlats };
}

interface ResolvedHeightTexture {
  texture: WebGLTexture;
  fromVoxel: boolean;
  hasRelief: boolean;
}

async function resolveHeightTexture(
  gl: WebGL2RenderingContext,
  url: string,
  sourceCanvas: CanvasImageSource | undefined,
  width: number,
  height: number,
  fallback: WebGLTexture,
  kind: 'wall' | 'flat' = 'flat'
): Promise<ResolvedHeightTexture> {
  const maxDim = kind === 'flat' ? MAX_PROC_FLAT : MAX_PROC_WALL;
  const procW = Math.min(width, maxDim);
  const procH = Math.min(height, maxDim);

  const voxelBitmap = await tryLoadVoxelHeightBitmap(url);
  if (voxelBitmap) {
    return {
      texture: uploadHeightBitmap(gl, voxelBitmap),
      fromVoxel: true,
      hasRelief: true,
    };
  }

  if (sourceCanvas) {
    const pixels = generateHeightFromCanvas(sourceCanvas, procW, procH);
    return {
      texture: uploadHeightPixels(gl, procW, procH, pixels),
      fromVoxel: false,
      hasRelief: true,
    };
  }

  return { texture: fallback, fromVoxel: false, hasRelief: false };
}

async function tryLoadVoxelHeightBitmap(url: string): Promise<ImageBitmap | null> {
  if (heightUrlMissCache.has(url)) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      heightUrlMissCache.add(url);
      return null;
    }
    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch {
    heightUrlMissCache.add(url);
    return null;
  }
}

export function generateHeightFromCanvas(
  source: CanvasImageSource,
  width: number,
  height: number
): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const pixels = heightPixelsFromRgba(rgba, width, height);
  return softenHeightPixels(pixels, width, height);
}

export function heightPixelsFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    lum[p] = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
  }

  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const center = lum[i];
      const left = lum[y * width + Math.max(0, x - 1)];
      const right = lum[y * width + Math.min(width - 1, x + 1)];
      const up = lum[Math.max(0, y - 1) * width + x];
      const down = lum[Math.min(height - 1, y + 1) * width + x];
      const emboss = center + (center - (left + right + up + down) * 0.25) * 1.65;
      const noise = ((x * 17 + y * 31) % 13) - 6;
      out[i] = Math.max(0, Math.min(255, Math.round(emboss + noise * 0.35)));
    }
  }

  return normalizeHeightRange(out, width, height);
}

export function normalizeHeightRange(
  pixels: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  let min = 255;
  let max = 0;
  for (let i = 0; i < pixels.length; i++) {
    min = Math.min(min, pixels[i]);
    max = Math.max(max, pixels[i]);
  }

  const range = max - min;
  if (range >= 10) {
    const mid = (min + max) * 0.5;
    const half = range * 0.5;
    for (let i = 0; i < pixels.length; i++) {
      const t = (pixels[i] - mid) / half;
      pixels[i] = Math.round(128 + t * 72);
    }
    return pixels;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const grain =
        (((x * 17) ^ (y * 31)) & 15) +
        (((x * 7) + (y * 11)) & 7);
      pixels[i] = Math.max(0, Math.min(255, 96 + grain * 8));
    }
  }

  return pixels;
}

export function hasHeightVariation(pixels: Uint8Array, minRange = 6): boolean {
  let min = 255;
  let max = 0;
  for (let i = 0; i < pixels.length; i++) {
    min = Math.min(min, pixels[i]);
    max = Math.max(max, pixels[i]);
  }
  return max - min >= minRange;
}

function uploadHeightBitmap(gl: WebGL2RenderingContext, bitmap: ImageBitmap): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  setHeightTextureParams(gl);
  bitmap.close();
  return texture;
}

function uploadHeightPixels(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  pixels: Uint8Array
): WebGLTexture {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, p = 0; i < pixels.length; i++) {
    const value = pixels[i];
    rgba[p++] = value;
    rgba[p++] = value;
    rgba[p++] = value;
    rgba[p++] = 255;
  }

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    rgba
  );
  setHeightTextureParams(gl);
  return texture;
}

function createSolidHeightTexture(gl: WebGL2RenderingContext, value: number): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([value, value, value, 255])
  );
  setHeightTextureParams(gl);
  return texture;
}

function softenHeightPixels(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          sum += pixels[sy * width + sx];
          count++;
        }
      }
      out[y * width + x] = Math.round(sum / count);
    }
  }
  return out;
}

function setHeightTextureParams(gl: WebGL2RenderingContext): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
}

export function clearHeightUrlMissCache(): void {
  heightUrlMissCache.clear();
}
