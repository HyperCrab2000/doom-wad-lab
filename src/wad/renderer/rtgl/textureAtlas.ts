import type { WallTexture } from '@/wad/interfaces/WallTexture';

import { SURFACE_FLAT, SURFACE_SPRITE, SURFACE_WALL } from './pathTraceConstants';

/** Match classic wall/flat source resolution (pow2 canvases, up to 256px). */
export const ATLAS_CELL_SIZE = 256;
const MAX_CELLS = 192;

export interface AtlasEntry {
  texName: string;
  surfaceKind: number;
}

export interface AtlasLayout {
  canvas: HTMLCanvasElement;
  cols: number;
  rows: number;
  cellSize: number;
  indexByName: Map<string, number>;
}

export interface CpuTextureAtlas {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  cols: number;
  rows: number;
  cellSize: number;
  indexByName: Map<string, number>;
}

function resolveCanvas(
  source: WallTexture | { graphics: CanvasRenderingContext2D }
): HTMLCanvasElement {
  return source.graphics.canvas;
}

/** Separate wall vs flat atlas slots — shared WAD names must not overwrite each other. */
export function atlasLookupKey(texName: string, surfaceKind: number): string {
  const prefix =
    surfaceKind === SURFACE_FLAT ? 'f' : surfaceKind === SURFACE_SPRITE ? 's' : 'w';
  return `${prefix}:${texName}`;
}

function resolveTextureCanvasForEntry(
  entry: AtlasEntry,
  wallTexturesByName: Record<string, WallTexture>,
  flatSources: ReadonlyMap<string, { graphics: CanvasRenderingContext2D }>,
  spriteSources: ReadonlyMap<string, { graphics: CanvasRenderingContext2D }>
): { canvas: HTMLCanvasElement; srcW: number; srcH: number } | null {
  const upper = entry.texName.toUpperCase();
  if (entry.surfaceKind === SURFACE_FLAT) {
    const flat = flatSources.get(entry.texName) ?? flatSources.get(upper);
    if (!flat) return null;
    return { canvas: flat.graphics.canvas, srcW: 64, srcH: 64 };
  }
  if (entry.surfaceKind === SURFACE_SPRITE) {
    const sprite = spriteSources.get(entry.texName) ?? spriteSources.get(upper);
    if (!sprite) return null;
    return { canvas: sprite.graphics.canvas, srcW: sprite.graphics.canvas.width, srcH: sprite.graphics.canvas.height };
  }
  const wall = wallTexturesByName[entry.texName] ?? wallTexturesByName[upper];
  if (!wall) return null;
  return { canvas: resolveCanvas(wall), srcW: wall.width, srcH: wall.height };
}

/** Sentinel stored in triangle metadata when a texture is missing from the atlas. */
export const INVALID_ATLAS_INDEX = 65535;

export function resolveAtlasIndex(
  texName: string,
  surfaceKind: number,
  indexByName: ReadonlyMap<string, number>
): number {
  const key = atlasLookupKey(texName, surfaceKind);
  const direct = indexByName.get(key);
  if (direct !== undefined) return direct;
  const upper = indexByName.get(atlasLookupKey(texName.toUpperCase(), surfaceKind));
  if (upper !== undefined) return upper;
  return INVALID_ATLAS_INDEX;
}

export function buildAtlasLayout(
  entries: AtlasEntry[],
  wallTexturesByName: Record<string, WallTexture>,
  flatSources: ReadonlyMap<string, { graphics: CanvasRenderingContext2D }>,
  spriteSources: ReadonlyMap<string, { graphics: CanvasRenderingContext2D }> = new Map()
): AtlasLayout {
  const seen = new Set<string>();
  const unique: AtlasEntry[] = [];
  for (const entry of entries) {
    if (!entry.texName || entry.texName === '-') continue;
    const key = atlasLookupKey(entry.texName, entry.surfaceKind);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
    if (unique.length >= MAX_CELLS) break;
  }

  const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, unique.length))));
  const rows = Math.max(1, Math.ceil(unique.length / cols));

  const canvas = document.createElement('canvas');
  canvas.width = cols * ATLAS_CELL_SIZE;
  canvas.height = rows * ATLAS_CELL_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const indexByName = new Map<string, number>();

  unique.forEach((entry, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const ox = col * ATLAS_CELL_SIZE;
    const oy = row * ATLAS_CELL_SIZE;
    const lookup = atlasLookupKey(entry.texName, entry.surfaceKind);
    indexByName.set(lookup, index);
    indexByName.set(atlasLookupKey(entry.texName.toUpperCase(), entry.surfaceKind), index);

    const resolved = resolveTextureCanvasForEntry(
      entry,
      wallTexturesByName,
      flatSources,
      spriteSources
    );
    if (!resolved) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(ox, oy, ATLAS_CELL_SIZE, ATLAS_CELL_SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      resolved.canvas,
      0,
      0,
      resolved.srcW,
      resolved.srcH,
      ox,
      oy,
      ATLAS_CELL_SIZE,
      ATLAS_CELL_SIZE
    );
  });

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 250) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
    }
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  return { canvas, cols, rows, cellSize: ATLAS_CELL_SIZE, indexByName };
}

export function atlasLayoutToCpu(layout: AtlasLayout): CpuTextureAtlas {
  const ctx = layout.canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, layout.canvas.width, layout.canvas.height);
  return {
    pixels: imageData.data,
    width: layout.canvas.width,
    height: layout.canvas.height,
    cols: layout.cols,
    rows: layout.rows,
    cellSize: layout.cellSize,
    indexByName: layout.indexByName,
  };
}

function fract(value: number): number {
  return value - Math.floor(value);
}

export function sampleCpuAtlas(
  atlas: CpuTextureAtlas,
  texName: string,
  surfaceKind: number,
  u: number,
  v: number,
  fallback: [number, number, number] = [0.45, 0.45, 0.45]
): [number, number, number] {
  const index = atlas.indexByName.get(atlasLookupKey(texName, surfaceKind));
  if (index === undefined) return fallback;

  const col = index % atlas.cols;
  const row = Math.floor(index / atlas.cols);
  const tx = Math.min(
    atlas.width - 1,
    Math.floor(col * atlas.cellSize + fract(u) * atlas.cellSize)
  );
  const ty = Math.min(
    atlas.height - 1,
    Math.floor(row * atlas.cellSize + fract(v) * atlas.cellSize)
  );
  const off = (ty * atlas.width + tx) * 4;
  return [atlas.pixels[off] / 255, atlas.pixels[off + 1] / 255, atlas.pixels[off + 2] / 255];
}

export interface TextureAtlas {
  texture: WebGLTexture;
  cols: number;
  rows: number;
  indexByName: Map<string, number>;
}

export function buildTextureAtlas(
  gl: WebGL2RenderingContext,
  entries: AtlasEntry[],
  wallTexturesByName: Record<string, WallTexture>,
  flatSources: ReadonlyMap<string, { graphics: CanvasRenderingContext2D }>,
  spriteSources: ReadonlyMap<string, { graphics: CanvasRenderingContext2D }> = new Map()
): TextureAtlas {
  const layout = buildAtlasLayout(entries, wallTexturesByName, flatSources, spriteSources);
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layout.canvas);

  return { texture, cols: layout.cols, rows: layout.rows, indexByName: layout.indexByName };
}

const atlasCache = new Map<string, TextureAtlas>();
const cpuAtlasCache = new Map<string, CpuTextureAtlas>();

export function getOrBuildTextureAtlas(
  gl: WebGL2RenderingContext,
  cacheKey: string,
  entries: AtlasEntry[],
  wallTexturesByName: Record<string, WallTexture>,
  flatSources: ReadonlyMap<string, { graphics: CanvasRenderingContext2D }>,
  spriteSources: ReadonlyMap<string, { graphics: CanvasRenderingContext2D }> = new Map()
): TextureAtlas {
  const hit = atlasCache.get(cacheKey);
  if (hit) return hit;
  const atlas = buildTextureAtlas(gl, entries, wallTexturesByName, flatSources, spriteSources);
  atlasCache.set(cacheKey, atlas);
  return atlas;
}

export function getOrBuildCpuTextureAtlas(
  cacheKey: string,
  entries: AtlasEntry[],
  wallTexturesByName: Record<string, WallTexture>,
  flatSources: ReadonlyMap<string, { graphics: CanvasRenderingContext2D }>,
  spriteSources: ReadonlyMap<string, { graphics: CanvasRenderingContext2D }> = new Map()
): CpuTextureAtlas {
  const hit = cpuAtlasCache.get(cacheKey);
  if (hit) return hit;
  const layout = buildAtlasLayout(entries, wallTexturesByName, flatSources, spriteSources);
  const atlas = atlasLayoutToCpu(layout);
  cpuAtlasCache.set(cacheKey, atlas);
  return atlas;
}

export function clearTextureAtlasCache(): void {
  atlasCache.clear();
  cpuAtlasCache.clear();
}
