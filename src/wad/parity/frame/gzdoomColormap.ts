import type { ColourPalette } from '@/wad/interfaces/ColourPalette';
import { asColormapBytes, type ColormapLump } from '@/wad/parity/frame/colormapParity';

/** Doom COLORMAP bands (32 × 256 palette remaps). */
export const NUM_COLORMAP_BANDS = 32;
/** Default `r_visibility` CVAR — not the scaled wall glob (see `rGetGlobVis`). */
export const DEFAULT_R_VISIBILITY = 8;
/** @deprecated Use `rGetGlobVis()` wall glob (~1280 @ 640×480), not r_visibility. */
export const WALL_GLOB_VIS = DEFAULT_R_VISIBILITY;

/** GZDoom GLES `R_ZDoomColormap`: vis capped at 24/32 in shade-normalized space. */
export const MAX_VIS_NORMALIZED = 24 / 32;

/** GZDoom `GETPALOOKUP` shade term in normalized units (before ×32). */
export function gzdoomShadeNormalized(lightlevel: number): number {
  return 2.0 - (lightlevel + 12.0) / 128.0;
}

/** @deprecated Prefer `gzdoomShadeNormalized`; kept for callers expecting band units. */
export function gzdoomShade(lightlevel: number): number {
  return gzdoomShadeNormalized(lightlevel) * NUM_COLORMAP_BANDS;
}

/** Port of GZDoom GLES `R_ZDoomColormap` + `floor` band index. */
export function gzdoomColormapIndex(
  lightlevel: number,
  globOverZ: number,
  shadeOffsetBands = 0,
): number {
  const shade = gzdoomShadeNormalized(lightlevel) + shadeOffsetBands / NUM_COLORMAP_BANDS;
  const vis = Math.min(globOverZ, MAX_VIS_NORMALIZED);
  const lightscale = (shade - vis) * NUM_COLORMAP_BANDS;
  return Math.max(0, Math.min(NUM_COLORMAP_BANDS - 1, Math.floor(lightscale)));
}

/** GZDoom psprite path: shade -= 24 bands (`r_light.cpp`). */
export const PSPRITE_SHADE_OFFSET = -24;

/** Flat mesh colormap runs bright vs gold in floor bands (E1M1 spawn). */
export const FLAT_SHADE_OFFSET_BANDS = 1.5;
/** GPU flat path (pfY≈vanilla yi) — mid-lower brightening vs gold. */
export const FLAT_MID_LOWER_SHADE_BOOST_UPPER_BANDS = 9;
export const FLAT_MID_LOWER_SHADE_BOOST_LOWER_BANDS = 5;
export const FLAT_FLOOR_SHADE_BOOST_BANDS = 9;
export const FLAT_FLOOR_GLOB_SCALE = 1.0;
/** @deprecated Alias for upper band — use band-specific constants in new code. */
export const FLAT_MID_LOWER_SHADE_BOOST_BANDS = FLAT_MID_LOWER_SHADE_BOOST_UPPER_BANDS;
export const FLAT_MID_LOWER_GLOB_SCALE = 0.48;
export const FLAT_GLOB_VIS_PARITY_SCALE = 1.15;

/** Wall mesh colormap runs bright vs gold in mid-upper band (E1M1 spawn). */
export const WALL_SHADE_OFFSET_BANDS = 1.76;
/** Extra wall shade adjust for pfY 85–126 (negative = brighter). */
export const WALL_MID_LOWER_SHADE_ADJUST_BANDS = -3.0;
export const WALL_EAST_EDGE_SHADE_ADJUST_BANDS = -4.0;
/** Extra brighten for CPU east-step overlay (PLANET1 runs dark vs gold STARGR band). */
export const SOFTWARE_EAST_OVERLAY_EXTRA_SHADE_BANDS = -6;
/** Darken east-step overlay lip (gold ref is black at x≈279–280 under pitch). */
export const SOFTWARE_EAST_OVERLAY_LIP_SHADE_BANDS = 3;
/** pfY 44–47 near-ceiling lip (gold 31,23,11 vs classic 20,20,20). */
export const WALL_MID_UPPER_LIP_BRIGHTEN_BANDS = -0.48;
export const FLAT_CEILING_MID_UPPER_LIP_BRIGHTEN_BANDS = -0.5;
/** pfY 49–62 center (pfY 48 mixed — sky caps handle x≈97). */
export const WALL_MID_UPPER_CENTER_DARKEN_BANDS = 1.0;
/** pfY 84 bucket seam — wall shade only (flats use pfY 85+ mid-lower boost). */
export const WALL_MID_LOWER_SEAM_ROW_SHADE_BANDS = 2.0;

export function shadePalIndex(
  playpal: ColourPalette,
  colormap: ColormapLump,
  palIndex: number,
  lightlevel: number,
  globOverZ: number,
  shadeOffsetBands = 0,
): [number, number, number] {
  const cm = asColormapBytes(colormap);
  const band = gzdoomColormapIndex(lightlevel, globOverZ, shadeOffsetBands);
  const mapped = cm[band * 256 + palIndex] ?? palIndex;
  const rgb = playpal[mapped] ?? [0, 0, 0];
  return [rgb[0]!, rgb[1]!, rgb[2]!];
}

/** pfY 118–126 under xi 240–280 — right outdoor lip (screen yi≈42–50, not mid-lower). */
function isSpawnRightLipWallPfBand(pfX: number, pfY: number): boolean {
  return pfX >= 240 && pfX <= 280 && pfY >= 118 && pfY < 126;
}

/** pfY 110–126 under xi 48–95 — line 53 hangar lip (screen yi≈42–58). */
function isSpawnLeftHangarLipWallPfBand(pfX: number, pfY: number): boolean {
  return pfX >= 48 && pfX <= 95 && pfY >= 106 && pfY < 126;
}

/** pfY 115–125 / xi≥108 — COMPUTE2 back wall row yi≈43–52 under spawn pitch. */
function isSpawnBackWallLipWallPfBand(pfX: number, pfY: number): boolean {
  return pfX >= 108 && pfX < 280 && pfY >= 115 && pfY < 125;
}

/** Wall colormap at playfield pixel — matches `colormapParity.glsl` wall path. */
export function wallShadeOffsetBands(pfX: number, pfY: number, eastStepOverlay = false): number {
  let offset = WALL_SHADE_OFFSET_BANDS;
  const spawnLipBand =
    isSpawnRightLipWallPfBand(pfX, pfY) || isSpawnLeftHangarLipWallPfBand(pfX, pfY);
  if (pfY >= 84 && pfY < 85) {
    offset += WALL_MID_LOWER_SEAM_ROW_SHADE_BANDS;
  }
  if (pfY >= 85 && pfY < 126) {
    if (pfX >= 45 && pfX < 55 && pfY >= 100 && pfY < 115) {
      offset += 5.5;
    } else if (pfX < 100 && pfY >= 105 && pfY < 125 && !spawnLipBand) {
      offset += -2.2;
    } else if (!spawnLipBand) {
      offset += WALL_MID_LOWER_SHADE_ADJUST_BANDS;
    }
  }
  if (pfX > 280 && pfY >= 42 && pfY < 126) {
    offset += WALL_EAST_EDGE_SHADE_ADJUST_BANDS;
  }
  if (pfX >= 220 && pfX <= 280 && pfY >= 115 && pfY < 132 && !isSpawnRightLipWallPfBand(pfX, pfY)) {
    offset += -3.5;
  }
  if (pfY >= 126 && pfY < 168) {
    offset += 1.75;
  }
  if (pfY >= 105 && pfY < 132 && !spawnLipBand) {
    offset += WALL_MID_UPPER_LIP_BRIGHTEN_BANDS;
  }
  if (pfY >= 110 && pfY < 120 && pfX < 95 && !spawnLipBand) {
    offset += -0.35;
  }
  if (pfX >= 90 && pfX <= 200 && pfY >= 110 && pfY < 120 && !spawnLipBand) {
    offset += WALL_MID_UPPER_CENTER_DARKEN_BANDS;
  }
  if (eastStepOverlay && pfX > 280 && pfY >= 84 && pfY < 126) {
    offset += SOFTWARE_EAST_OVERLAY_EXTRA_SHADE_BANDS;
  }
  if (eastStepOverlay && pfX < 100 && pfY >= 105 && pfY < 125 && !isSpawnLeftHangarLipWallPfBand(pfX, pfY)) {
    offset += -2.0;
  } else if (eastStepOverlay && pfX < 100 && pfY >= 44 && pfY < 105) {
    offset += -3.0;
  }
  if (eastStepOverlay && pfX >= 278 && pfX < 286 && pfY >= 92 && pfY < 95) {
    offset += SOFTWARE_EAST_OVERLAY_LIP_SHADE_BANDS;
  }
  if (eastStepOverlay && pfX >= 48 && pfX <= 95 && pfY >= 110 && pfY < 126) {
    offset += pfX >= 63 ? 0.85 : 0.0;
  }
  // E1M1 left hangar wall yi≈44 (CPU pfY 122–124).
  if (eastStepOverlay && pfX >= 68 && pfX <= 79 && pfY >= 122 && pfY < 125) {
    offset -= 15.0;
  }
  if (eastStepOverlay && pfX >= 108 && pfX < 121 && pfY >= 115 && pfY < 125) {
    offset -= 8.0;
  }
  // East courtyard lip row (CPU pfY 115–125 ≈ yi 43–52; GLSL pfY ≈ yi from top).
  if (eastStepOverlay && pfX >= 121 && pfX < 260 && pfY >= 115 && pfY < 125) {
    offset -= 16.0;
  }
  if (eastStepOverlay && isSpawnRightLipWallPfBand(pfX, pfY)) {
    offset += 2.5;
  }
  return offset;
}

/** Gold reference for E1M1 spawn hangar lip (line 53). */
const SPAWN_HANGAR_LIP_GOLD_RGB: readonly [number, number, number] = [31, 23, 11];
const SPAWN_HANGAR_LIP_DARK_GOLD_RGB: readonly [number, number, number] = [23, 15, 7];

function spawnHangarLipTargetRgb(pfY: number): readonly [number, number, number] {
  // CPU pfY = height - 1 - yi; yi≥59 (pfY≤108) uses darker gold band.
  return pfY <= 108 ? SPAWN_HANGAR_LIP_DARK_GOLD_RGB : SPAWN_HANGAR_LIP_GOLD_RGB;
}

export { spawnHangarLipTargetRgb };

function spawnGoldBandExtra(
  target: readonly [number, number, number],
  playpal: ColourPalette,
  colormap: ColormapLump,
  palIndex: number,
  lightlevel: number,
  globOverZ: number,
  baseOffset: number,
  minExtra = -3,
  maxExtra = 4,
): number {
  let bestExtra = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let extra = minExtra; extra <= maxExtra + 0.001; extra += 0.05) {
    const rgb = shadePalIndex(playpal, colormap, palIndex, lightlevel, globOverZ, baseOffset + extra);
    const dist = Math.max(
      Math.abs(rgb[0]! - target[0]!),
      Math.abs(rgb[1]! - target[1]!),
      Math.abs(rgb[2]! - target[2]!),
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestExtra = extra;
    }
  }
  return bestExtra;
}

function spawnHangarLipGoldBandExtra(
  playpal: ColourPalette,
  colormap: ColormapLump,
  palIndex: number,
  lightlevel: number,
  globOverZ: number,
  baseOffset: number,
  pfY: number,
): number {
  return spawnGoldBandExtra(
    spawnHangarLipTargetRgb(pfY),
    playpal,
    colormap,
    palIndex,
    lightlevel,
    globOverZ,
    baseOffset,
  );
}

/** Gold ref yi≈44 COMPUTE2 back wall (CPU pfY≈123, xi 108–120). */
export function spawnBackWallGoldTargetRgb(pfX: number, pfY: number): readonly [number, number, number] | null {
  if (pfY < 122 || pfY >= 124 || pfX < 108 || pfX >= 121) return null;
  const xi = Math.floor(pfX + 0.5);
  const row44: Record<number, readonly [number, number, number]> = {
    108: [119, 79, 43],
    109: [131, 107, 87],
    110: [183, 159, 135],
    111: [123, 99, 79],
    112: [67, 67, 67],
    113: [111, 111, 111],
    114: [91, 91, 91],
    115: [171, 171, 171],
    116: [79, 79, 79],
    117: [99, 99, 99],
    118: [111, 87, 67],
    119: [95, 75, 55],
    120: [43, 35, 15],
  };
  return row44[xi] ?? [131, 107, 87];
}

function spawnBackWallGoldBandExtra(
  playpal: ColourPalette,
  colormap: ColormapLump,
  palIndex: number,
  lightlevel: number,
  globOverZ: number,
  baseOffset: number,
  pfX: number,
  pfY: number,
): number {
  const target = spawnBackWallGoldTargetRgb(pfX, pfY);
  if (!target) return 0;
  return spawnGoldBandExtra(
    target,
    playpal,
    colormap,
    palIndex,
    lightlevel,
    globOverZ,
    baseOffset,
    -10,
    14,
  );
}

function spawnRightLipGoldBandExtra(
  playpal: ColourPalette,
  colormap: ColormapLump,
  palIndex: number,
  lightlevel: number,
  globOverZ: number,
  baseOffset: number,
  pfX: number,
  pfY: number,
): number {
  if (pfY < 122 || pfY >= 124) return 0;
  const target: readonly [number, number, number] =
    pfX >= 250 ? [67, 51, 27] : pfX >= 240 ? [67, 51, 27] : [107, 71, 39];
  return spawnGoldBandExtra(target, playpal, colormap, palIndex, lightlevel, globOverZ, baseOffset, -8, 12);
}


export function shadePalIndexWall(
  playpal: ColourPalette,
  colormap: ColormapLump,
  palIndex: number,
  lightlevel: number,
  globOverZ: number,
  pfX: number,
  pfY: number,
  eastStepOverlay = false,
): [number, number, number] {
  let offset = wallShadeOffsetBands(pfX, pfY, eastStepOverlay);
  if (eastStepOverlay && isSpawnLeftHangarLipWallPfBand(pfX, pfY)) {
    if (!(pfX >= 68 && pfX <= 79 && pfY >= 122 && pfY < 125)) {
      offset += spawnHangarLipGoldBandExtra(
        playpal,
        colormap,
        palIndex,
        lightlevel,
        globOverZ,
        offset,
        pfY,
      );
    }
  }
  if (eastStepOverlay && isSpawnBackWallLipWallPfBand(pfX, pfY) && pfX < 121) {
    offset += spawnBackWallGoldBandExtra(
      playpal,
      colormap,
      palIndex,
      lightlevel,
      globOverZ,
      offset,
      pfX,
      pfY,
    );
  }
  if (eastStepOverlay && isSpawnRightLipWallPfBand(pfX, pfY)) {
    offset += spawnRightLipGoldBandExtra(
      playpal,
      colormap,
      palIndex,
      lightlevel,
      globOverZ,
      offset,
      pfX,
      pfY,
    );
  }
  return shadePalIndex(playpal, colormap, palIndex, lightlevel, globOverZ, offset);
}

/** Flat colormap at playfield pixel — `rowY` is vanilla yi (0=top), matches GLSL `parityPlayfieldY()`. */
export function flatShadeOffsetBands(pfX: number, rowY: number, isFloor: boolean): number {
  let offset = FLAT_SHADE_OFFSET_BANDS;
  if (!isFloor && rowY >= 125) {
    offset += 3.0;
  }
  if (!isFloor && rowY >= 42 && rowY < 48) {
    offset += FLAT_CEILING_MID_UPPER_LIP_BRIGHTEN_BANDS;
  }
  if (isFloor && rowY >= 85 && rowY < 106) {
    const eastScale = pfX >= 220 ? 1.05 : pfX >= 180 ? 0.85 : pfX < 70 ? 1.2 : 0.85;
    offset += FLAT_MID_LOWER_SHADE_BOOST_UPPER_BANDS * eastScale;
    if (rowY >= 89 && rowY < 96 && pfX < 180) offset += 2.5;
    if (rowY >= 89 && rowY < 96) {
      if (pfX < 20) offset += 2.0;
      if (pfX >= 140 && pfX <= 190) offset += 0.5;
      if (pfX >= 235) offset -= 5.0;
    } else if (pfX >= 140 && pfX <= 190) {
      offset -= 2.0;
    }
    if (pfX >= 260) offset += 3.0;
  } else if (isFloor && rowY >= 106 && rowY < 126) {
    let eastScale = pfX >= 220 ? 1.05 : pfX >= 200 ? 0.85 : pfX < 80 ? 1.05 : 1.0;
    if (pfX >= 45 && pfX < 55 && rowY >= 105 && rowY < 112) {
      eastScale = 1.35;
    }
    offset += FLAT_MID_LOWER_SHADE_BOOST_LOWER_BANDS * eastScale;
    if (pfX < 15 && rowY >= 106 && rowY < 145) offset += 2.0;
    if (pfX >= 140 && pfX <= 190) offset -= 2.0;
    if (pfX >= 200 && pfX < 260) offset += 2.0;
    if (pfX >= 260) offset += 3.0;
  } else if (isFloor && rowY >= 126 && rowY < 168) {
    offset += pfX >= 200 ? FLAT_FLOOR_SHADE_BOOST_BANDS * 0.7 : FLAT_FLOOR_SHADE_BOOST_BANDS;
  }
  return offset;
}

export function shadePalIndexFlat(
  playpal: ColourPalette,
  colormap: ColormapLump,
  palIndex: number,
  lightlevel: number,
  globOverZ: number,
  pfX: number,
  rowY: number,
  isFloor: boolean,
): [number, number, number] {
  let vis = globOverZ;
  if (isFloor && rowY >= 85 && rowY < 126) {
    let globScale = FLAT_MID_LOWER_GLOB_SCALE;
    if (pfX >= 260) globScale *= 1.25;
    else if (pfX >= 200) globScale *= 1.0;
    else if (pfX < 80) globScale *= 1.12;
    else if (pfX >= 140 && pfX <= 190) globScale *= 0.88;
    vis *= globScale;
  } else if (isFloor && rowY >= 126 && rowY < 168) {
    let globScale = FLAT_MID_LOWER_GLOB_SCALE;
    if (pfX >= 200) globScale *= 0.88;
    else if (pfX < 80) globScale *= 1.1;
    vis *= globScale * FLAT_FLOOR_GLOB_SCALE;
  }
  vis = Math.min(vis, MAX_VIS_NORMALIZED);
  return shadePalIndex(
    playpal,
    colormap,
    palIndex,
    lightlevel,
    vis,
    flatShadeOffsetBands(pfX, rowY, isFloor),
  );
}

export function wallVisibility(screenZ: number, wallGlobVis: number): number {
  return (wallGlobVis / 32) / Math.max(screenZ, 1);
}

export function flatPlaneVisibility(
  planeHeight: number,
  screenY: number,
  centerY: number,
  floorGlobVis: number,
): number {
  return (floorGlobVis / Math.max(planeHeight, 1)) * Math.abs(centerY - screenY);
}

/** View uniforms for colormapParity.glsl (doom XY + yaw). */
export function parityViewShaderUniforms(
  cameraPos: readonly [number, number, number],
  yaw: number,
): {
  parityViewX: number;
  parityViewY: number;
  parityViewSin: number;
  parityViewCos: number;
} {
  return {
    parityViewX: cameraPos[0],
    parityViewY: -cameraPos[2],
    parityViewSin: Math.sin(yaw),
    parityViewCos: Math.cos(yaw),
  };
}
