import type { ColourPalette } from '@/wad/interfaces/ColourPalette';

/** Doom COLORMAP bands (32 × 256 palette remaps). */
export const NUM_COLORMAP_BANDS = 32;
export const WALL_GLOB_VIS = 8;
export const MAX_LIGHT_VIS = 24;

/** GZDoom `GETPALOOKUP` shade term (matches colormapParity.glsl). */
export function gzdoomShade(lightlevel: number): number {
  return NUM_COLORMAP_BANDS * 2 - (lightlevel + 12) * (NUM_COLORMAP_BANDS / 128);
}

export function gzdoomColormapIndex(
  lightlevel: number,
  visibility: number,
  shadeOffset = 0,
): number {
  const shade = gzdoomShade(lightlevel) + shadeOffset;
  const vis = Math.min(MAX_LIGHT_VIS, visibility);
  return Math.max(0, Math.min(NUM_COLORMAP_BANDS - 1, Math.floor(shade - vis)));
}

/** GZDoom psprite path: visibility 0, shade -= 24 (`r_light.cpp`). */
export const PSPRITE_SHADE_OFFSET = -24;

export function shadePalIndex(
  playpal: ColourPalette,
  colormap: readonly number[],
  palIndex: number,
  lightlevel: number,
  visibility: number,
): [number, number, number] {
  const band = gzdoomColormapIndex(lightlevel, visibility);
  const mapped = colormap[band * 256 + palIndex] ?? palIndex;
  const rgb = playpal[mapped] ?? [0, 0, 0];
  return [rgb[0]!, rgb[1]!, rgb[2]!];
}

export function wallVisibility(screenZ: number): number {
  return WALL_GLOB_VIS / Math.max(screenZ, 1);
}

export function flatPlaneVisibility(
  planeHeight: number,
  screenY: number,
  centerY: number,
): number {
  return (WALL_GLOB_VIS / Math.max(planeHeight, 1)) * Math.abs(centerY - screenY);
}
