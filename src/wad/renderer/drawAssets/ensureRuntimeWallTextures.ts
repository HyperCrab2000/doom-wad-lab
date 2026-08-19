import type { Wad } from '@/wad/interfaces/Wad';
import type { WadAssets } from '@/wad/renderer/drawAssets/drawWadAssets';
import {
  rasterizeTextureIndex,
  uploadIndexRasterTexture,
} from '@/wad/parity/raster/rasterizeIndex';

function hasWallTexture(
  walls: Record<string, WebGLTexture>,
  name: string
): boolean {
  return Boolean(walls[name] ?? walls[name.toUpperCase()]);
}

/** Upload GL wall textures that were not in the initial map asset set (e.g. SW2 after switch flip). */
export function ensureRuntimeWallTextures(
  gl: WebGL2RenderingContext,
  wad: Wad,
  wadAssets: WadAssets,
  walls: Record<string, WebGLTexture>,
  names: Iterable<string>,
  useIndexTextures: boolean
): number {
  let uploaded = 0;
  for (const rawName of names) {
    if (!rawName || rawName === '-') continue;
    if (hasWallTexture(walls, rawName)) continue;

    const wallTex = wad.textures[rawName] ?? wad.textures[rawName.toUpperCase()];
    if (!wallTex) continue;

    if (useIndexTextures) {
      walls[rawName] = uploadIndexRasterTexture(gl, rasterizeTextureIndex(wallTex, wad));
    } else {
      const asset = wadAssets.texturesByName[rawName] ?? wadAssets.texturesByName[rawName.toUpperCase()];
      if (!asset?.graphics?.canvas) continue;
      walls[rawName] = createWallTextureFromCanvas(gl, asset.graphics.canvas);
    }
    uploaded++;
  }
  return uploaded;
}

function createWallTextureFromCanvas(
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

/** Collect wall texture names from refreshed wall buffers. */
export function wallTextureNamesFromBuffers(
  walls: ReadonlyArray<{ texName: string }>
): Set<string> {
  const names = new Set<string>();
  for (const wall of walls) {
    if (wall.texName && wall.texName !== '-') names.add(wall.texName);
  }
  return names;
}
