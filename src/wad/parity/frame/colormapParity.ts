import type { ColourPalette } from '@/wad/interfaces/ColourPalette';

/** Doom COLORMAP bands (32 × 256 palette remaps). */
export const NUM_COLORMAP_BANDS = 32;

/** Sector light → colormap band (vanilla `lightlevel >> 3`). */
export function sectorColormapBand(lightlevel: number): number {
  return Math.min(NUM_COLORMAP_BANDS - 1, Math.max(0, lightlevel >> 3));
}

/** Normalized V coordinate for colormap LUT texture sampling. */
export function colormapBandV(lightlevel: number): number {
  return (sectorColormapBand(lightlevel) + 0.5) / NUM_COLORMAP_BANDS;
}

/** 256×32 RGBA LUT: playpal[colormap[band * 256 + palIndex]]. */
export function buildColormapLutRgba(playpal: ColourPalette, colormap: number[]): Uint8Array {
  const out = new Uint8Array(256 * NUM_COLORMAP_BANDS * 4);
  for (let band = 0; band < NUM_COLORMAP_BANDS; band++) {
    for (let palIdx = 0; palIdx < 256; palIdx++) {
      const mapped = colormap[band * 256 + palIdx] ?? palIdx;
      const rgb = playpal[mapped] ?? [0, 0, 0];
      const i = (band * 256 + palIdx) * 4;
      out[i] = rgb[0]!;
      out[i + 1] = rgb[1]!;
      out[i + 2] = rgb[2]!;
      out[i + 3] = 255;
    }
  }
  return out;
}

export function uploadColormapLutTexture(
  gl: WebGL2RenderingContext,
  playpal: ColourPalette,
  colormap: number[],
): WebGLTexture {
  const data = buildColormapLutRgba(playpal, colormap);
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    256,
    NUM_COLORMAP_BANDS,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}
