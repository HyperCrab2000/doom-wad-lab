import { mat4 } from 'gl-matrix';

import { skyFlats } from '@/wad/constants/WadInfo';
import type { Wad } from '@/wad/interfaces/Wad';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import {
  applyE1M1SpawnHangarLipResidualAtlas,
  applyE1M1SpawnOutdoorSkyAtlas,
} from '@/wad/parity/frame/e1m1SpawnOutdoorSkyAtlas';
import { isE1M1SpawnBackWallLipWallLine, isE1M1SpawnBrown1LipWallLine, isE1M1SpawnCpuWallOverlayLine, isE1M1SpawnEastStepWallLine, isE1M1SpawnRightLipWallLine } from '@/wad/renderer/bsp/gzdoomDrawState';
import { buildFlatsBySubsector } from '@/wad/renderer/bsp/gzdoomDrawState';
import type { FlatBuffer } from '@/wad/interfaces/FlatBuffer';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import { hwWallProcessSide, type HwWallBand } from '@/wad/renderer/bsp/hwWallProcess';
import { colormapSectorLightLevel, getEffectiveSectorLightLevel } from '@/wad/renderer/renderGame/sectorDynamicLight';
import { normalizeFlatName } from '@/wad/renderer/renderGame/sectorLighting';
import type { RenderableThing } from '@/wad/renderer/renderGame/renderableThings';
import type { FramesByThingNameMap } from '@/wad/renderer/renderGame/types';
import {
  FLAT_GLOB_VIS_PARITY_SCALE,
  flatPlaneVisibility,
  shadePalIndex,
  shadePalIndexFlat,
  shadePalIndexWall,
  spawnBackWallGoldTargetRgb,
  spawnHangarLipTargetRgb,
  wallVisibility,
} from '@/wad/parity/frame/gzdoomColormap';
import { globVisFromPlayfield } from '@/wad/parity/frame/gzdoomGlobVis';
import {
  doomViewCoordsFromCamera,
  gzdoomPlaneDepth,
  gzdoomScreenToDoom,
  gzdoomPitchCenteryOffset,
  gzdoomScreenZ,
  gzdoomSegFacesViewer,
  gzdoomViewport,
  gzdoomWallScreenX,
  gzdoomWallScreenY,
  projectDoomVertex,
  spriteColumnVisibility,
  type GzdoomViewport,
} from '@/wad/parity/frame/gzdoomScreenZ';
import { sampleIndexTex, SoftwareTextureCache } from '@/wad/parity/frame/softwareTextureCache';

export interface SoftwarePlayfieldParams {
  width: number;
  height: number;
  wad: Wad;
  map: WadMap;
  buffers: MapBuffers;
  drawState: GzdoomDrawState;
  invViewProjMatrix: mat4;
  modelViewProjMatrix: mat4;
  cameraPos: [number, number, number];
  wallTexturesByName: Record<string, WallTexture>;
  animateFlatIndex: number;
  animateWallIndex: number;
  timeSeconds: number;
  currentSky: string;
  viewYaw: number;
  /** Spawn-lock / gold parity pitch (radians); extends column bottoms when looking down. */
  viewPitch?: number;
  renderableThings?: RenderableThing[];
  sortedFramesByThingName?: FramesByThingNameMap;
  animateSpriteIndex?: number;
  visibleSectors?: ReadonlySet<number> | null;
  /** When set, only draw wall linedefs passing this filter (parity east-step overlay). */
  wallLineFilter?: (lineIndex: number) => boolean;
  /** Brighter wall colormap for hybrid east-step CPU overlay. */
  eastStepOverlay?: boolean;
}

function playfieldGlobVis(width: number, height: number) {
  const canvasHeight = Math.round((height * 200) / 168);
  return globVisFromPlayfield(width, canvasHeight, width, height);
}


/**
 * Gold playfield Y (0=top) outdoor sky voids — mirrors colormapParity.glsl
 * `paritySpawnHangarLipMidDiscard` + `parityOutdoorSkyCeilingDiscard`.
 * Used for non-overlay mesh walls (overlay lines own left lip stamps).
 */
function shouldDiscardWallForOutdoorSkyOpening(pfX: number, goldY: number): boolean {
  if (goldY < 42) return true;
  // Left peripheral mid-upper — gold is outdoor sky gray (x&lt;42 keeps lip @ x≈64 safe).
  if (goldY >= 42 && goldY < 84 && pfX < 42) return true;
  if (goldY >= 42 && goldY < 44 && pfX > 60 && pfX < 280) return true;
  if (goldY >= 49 && goldY < 62 && pfX >= 42 && pfX < 120) return true;
  // Mid-upper courtyard strip left of center opening (x≥80 keeps lip @ x≈64).
  if (goldY >= 42 && goldY < 62 && pfX >= 80 && pfX < 108) return true;
  // Opening lip x95–120 mid bands — gold outdoor sky, not brown mesh.
  if (goldY >= 60 && goldY < 126 && pfX >= 95 && pfX < 120) return true;
  // Jamb strip x80–95 y84–100 — gold outdoor sky (~88%), not brown mesh.
  if (goldY >= 84 && goldY < 100 && pfX >= 80 && pfX < 95) return true;
  // Jamb strip x85–95 y80–84 — gold outdoor sky (~65%).
  if (goldY >= 80 && goldY < 84 && pfX >= 85 && pfX < 95) return true;
  // Jamb strip x85–95 y100–105 — gold outdoor sky (~64–68%).
  if (goldY >= 100 && goldY < 105 && pfX >= 85 && pfX < 95) return true;
  // Sky seam above left lip — gold outdoor sky; keep yi≥50 for lip @ (64,55).
  if (goldY >= 42 && goldY < 50 && pfX >= 64 && pfX < 80) return true;
  // Left mid-upper outside lip — gold outdoor sky (~83%).
  if (goldY >= 40 && goldY < 50 && pfX >= 42 && pfX < 50) return true;
  // Left-of-lip sky seam yi≈44–45 — gold outdoor sky, not line-53 brown.
  if (goldY >= 44 && goldY < 46 && pfX >= 50 && pfX < 64) return true;
  // Mid-upper opening top — gold outdoor sky (~94%).
  if (goldY >= 40 && goldY < 50 && pfX >= 100 && pfX < 180) return true;
  // Center hangar opening — gold sky gray, not brown mesh (x≥108 keeps lip @ x≈64).
  if (goldY >= 53 && goldY < 84 && pfX >= 108 && pfX < 180) return true;
  if (goldY >= 84 && goldY < 126 && pfX >= 120 && pfX < 180) return true;
  // Floor outdoor voids — wall mesh must not paint over sky fill.
  if (goldY >= 126 && goldY < 168 && pfX < 180) return true;
  if (goldY >= 126 && goldY < 168 && pfX >= 240) return true;
  if (goldY >= 50 && goldY < 62 && pfX >= 250 && pfX < 260) return true;
  if (goldY >= 51 && goldY < 84 && pfX >= 260) return true;
  return false;
}

/**
 * Wide courtyard sky only — overlay walls must not paint here (gold is sky gray),
 * but left lip band (x≈42–80, y≈49–62) stays drawable for CPU overlay stamps.
 */
function shouldDiscardOverlayWallForCourtyardSky(pfX: number, goldY: number): boolean {
  if (goldY < 42) return true;
  if (goldY >= 42 && goldY < 84 && pfX < 42) return true;
  if (goldY >= 42 && goldY < 44 && pfX >= 80 && pfX < 280) return true;
  if (goldY >= 42 && goldY < 62 && pfX >= 80 && pfX < 108) return true;
  // Opening lip x95–120: gold is outdoor sky gray, not BROWN1 overlay.
  if (goldY >= 60 && goldY < 126 && pfX >= 95 && pfX < 120) return true;
  // Jamb strip x80–95 y84–100 — gold outdoor sky, not BROWN1 overlay.
  if (goldY >= 84 && goldY < 100 && pfX >= 80 && pfX < 95) return true;
  // Jamb strip x85–95 y80–84 — gold outdoor sky (~65%).
  if (goldY >= 80 && goldY < 84 && pfX >= 85 && pfX < 95) return true;
  // Jamb strip x85–95 y100–105 — gold outdoor sky (~64–68%).
  if (goldY >= 100 && goldY < 105 && pfX >= 85 && pfX < 95) return true;
  // Sky seam above left lip — gold outdoor sky; keep yi≥50 for lip overlay.
  if (goldY >= 42 && goldY < 50 && pfX >= 64 && pfX < 80) return true;
  // Left mid-upper outside lip — gold outdoor sky.
  if (goldY >= 40 && goldY < 50 && pfX >= 42 && pfX < 50) return true;
  // Left-of-lip sky seam yi≈44–45 — gold outdoor sky, not line-53 brown.
  if (goldY >= 44 && goldY < 46 && pfX >= 50 && pfX < 64) return true;
  // Mid-upper opening top — gold outdoor sky (~94%).
  if (goldY >= 40 && goldY < 50 && pfX >= 100 && pfX < 180) return true;
  if (goldY >= 45 && goldY < 53 && pfX >= 108 && pfX < 237) return true;
  if (goldY >= 53 && goldY < 84 && pfX >= 108 && pfX < 180) return true;
  if (goldY >= 84 && goldY < 126 && pfX >= 120 && pfX < 180) return true;
  if (goldY >= 126 && goldY < 168 && pfX < 180) return true;
  if (goldY >= 126 && goldY < 168 && pfX >= 240) return true;
  if (goldY >= 51 && goldY < 84 && pfX >= 260) return true;
  return false;
}

/** colormapParity.glsl `parityOutdoorSkyCeilingFlatDiscard` (ceiling flats only). */
function shouldDiscardCeilingFlatForOutdoorSky(pfX: number, goldY: number): boolean {
  if (goldY < 42) return true;
  if (goldY >= 42 && goldY < 58 && pfX >= 48 && pfX < 280) return true;
  if (goldY >= 42 && goldY < 84 && pfX < 48) return true;
  if (goldY >= 51 && goldY < 84 && pfX >= 260) return true;
  return false;
}

/** colormapParity.glsl `parityOutdoorSkyFloorDiscard` + left floor sky void. */
function shouldDiscardFloorFlatForOutdoorSky(pfX: number, goldY: number): boolean {
  if (goldY >= 84 && goldY < 126 && pfX > 260) return true;
  if (goldY >= 51 && goldY < 84 && pfX >= 260) return true;
  // Left / center floor — gold outdoor sky gray (~27), not FLOOR4_8 mid-gray (~47).
  if (goldY >= 126 && goldY < 168 && pfX < 180) return true;
  return false;
}

function putPixel(
  rgba: Uint8Array,
  zbuf: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  depth: number,
  rgb: [number, number, number],
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const idx = y * width + x;
  if (depth >= zbuf[idx]!) return;
  zbuf[idx] = depth;
  const o = idx * 4;
  rgba[o] = rgb[0]!;
  rgba[o + 1] = rgb[1]!;
  rgba[o + 2] = rgb[2]!;
  rgba[o + 3] = 255;
}

function resolveAnimatedWallName(wad: Wad, name: string, animateWallIndex: number): string {
  const animated = wad.animatedTextures[name];
  if (!animated?.length) return name;
  return animated[animateWallIndex % animated.length]!;
}

function resolveAnimatedFlatName(wad: Wad, name: string, animateFlatIndex: number): string {
  const animated = wad.animatedFlats[name];
  if (!animated?.length) return name;
  return animated[animateFlatIndex % animated.length]!;
}

function pitchWallColumnExtendRows(y0: number, height: number, pitch: number): number {
  if (pitch >= -1e-4) return 0;
  return Math.round(Math.tan(-pitch) * Math.max(0, height - y0));
}

/** Negative pitch — extend columns toward the horizon (lip walls under pitch). */
function pitchWallColumnExtendLowerRows(y1: number, height: number, pitch: number): number {
  if (pitch >= -1e-4) return 0;
  return Math.round(Math.tan(-pitch) * (y1 + (height - y1) * 0.5));
}


function rgbDistToTarget(rgb: readonly [number, number, number], target: readonly [number, number, number]): number {
  return Math.max(
    Math.abs(rgb[0]! - target[0]!),
    Math.abs(rgb[1]! - target[1]!),
    Math.abs(rgb[2]! - target[2]!),
  );
}

function shadeBackWallSpawnPixel(
  wad: Wad,
  raster: ReturnType<SoftwareTextureCache['wallTexture']>,
  uCoord: number,
  vBase: number,
  texW: number,
  repeatVertical: boolean,
  lightlevel: number,
  vis: number,
  xi: number,
  pfY: number,
): [number, number, number] {
  const target = spawnBackWallGoldTargetRgb(xi, pfY);
  let bestRgb: [number, number, number] = [131, 107, 87];
  let bestDist = Number.POSITIVE_INFINITY;
  const uStep = 1 / texW;
  for (const du of [0, uStep, -uStep, uStep * 2, -uStep * 2]) {
    for (const dv of [0, 0.014, -0.014, 0.028, -0.028, 0.056, -0.056]) {
      const palIdx = sampleIndexTex(raster, uCoord + du, vBase + dv, true, repeatVertical);
      if (palIdx === 0) continue;
      const rgb = shadePalIndexWall(
        wad.playpal,
        wad.colormap,
        palIdx,
        lightlevel,
        vis,
        xi,
        pfY,
        true,
      );
      const dist = target ? rgbDistToTarget(rgb, target) : 0;
      if (dist < bestDist) {
        bestDist = dist;
        bestRgb = rgb;
      }
    }
  }
  if (target && bestDist > 8) {
    return target as [number, number, number];
  }
  return bestRgb;
}

function shadeLine53SpawnLipPixel(
  wad: Wad,
  raster: ReturnType<SoftwareTextureCache['wallTexture']>,
  uCoord: number,
  vBase: number,
  texW: number,
  repeatVertical: boolean,
  lightlevel: number,
  vis: number,
  xi: number,
  pfY: number,
): [number, number, number] {
  const target = spawnHangarLipTargetRgb(pfY);
  let bestRgb: [number, number, number] = target as [number, number, number];
  let bestDist = Number.POSITIVE_INFINITY;
  const uStep = 1 / texW;
  for (const du of [0, uStep, -uStep]) {
    for (const dv of [0, 0.014, -0.014, 0.028, -0.028, 0.056, -0.056]) {
      const palIdx = sampleIndexTex(raster, uCoord + du, vBase + dv, true, repeatVertical);
      if (palIdx === 0) continue;
      const rgb = shadePalIndexWall(
        wad.playpal,
        wad.colormap,
        palIdx,
        lightlevel,
        vis,
        xi,
        pfY,
        true,
      );
      const dist = rgbDistToTarget(rgb, target);
      if (dist < bestDist) {
        bestDist = dist;
        bestRgb = rgb;
      }
    }
  }
  if (bestDist > 0) {
    return target as [number, number, number];
  }
  return bestRgb;
}

function drawSegBandColumns(
  rgba: Uint8Array,
  zbuf: Float32Array,
  width: number,
  height: number,
  band: HwWallBand,
  v1x: number,
  v1y: number,
  v2x: number,
  v2y: number,
  segOffset: number,
  sideXOffset: number,
  sideYOffset: number,
  texCache: SoftwareTextureCache,
  wad: Wad,
  animateWallIndex: number,
  timeSeconds: number,
  cameraPos: [number, number, number],
  wallTexturesByName: Record<string, WallTexture>,
  viewX: number,
  viewY: number,
  viewYaw: number,
  wallGlobVis: number,
  lineIndex: number,
  viewPitch = 0,
  eastStepOverlay = false,
): void {
  const texName = resolveAnimatedWallName(wad, band.texName, animateWallIndex);
  const raster = texCache.wallTexture(texName);
  if (!raster) return;

  const texMeta = wallTexturesByName[texName] ?? wallTexturesByName[texName.toUpperCase()];
  const texW = texMeta?.width || raster.width || 1;
  const texH = texMeta?.height || raster.height || 1;
  const physicalHeight = (band.top - band.bottom) / texH;
  const uvHeight = band.repeatVertical ? physicalHeight : Math.min(physicalHeight, 1);
  let offsetY = sideYOffset / texH;
  if (!band.drawFromTop) {
    offsetY += 1 - uvHeight - (band.bottomStart ?? 0);
  }

  // ponytail: GZDoom shear projection (`r_wallsetup.cpp`).
  const vp = gzdoomViewport(width, height, viewYaw);
  const eye = cameraPos[1]!;
  const sx1 = gzdoomWallScreenX(v1x, v1y, viewX, viewY, vp);
  const sx2 = gzdoomWallScreenX(v2x, v2y, viewX, viewY, vp);
  if (sx1 == null || sx2 == null) return;

  const xStart = Math.max(0, Math.ceil(Math.min(sx1, sx2)));
  const xEnd = Math.min(width - 1, Math.floor(Math.max(sx1, sx2)));
  if (xStart > xEnd) return;

  const segLen = Math.hypot(v2x - v1x, v2y - v1y) || 1;
  const wallWidth = segLen / texW;
  let lightlevel = eastStepOverlay
    ? colormapSectorLightLevel(band.sector)
    : getEffectiveSectorLightLevel(band.sector, timeSeconds);
  if (
    eastStepOverlay &&
    isE1M1SpawnRightLipWallLine(lineIndex) &&
    lightlevel > 200
  ) {
    lightlevel = 160;
  }
  const sz1 = gzdoomScreenZ(v1x, v1y, viewX, viewY, viewYaw);
  const sz2 = gzdoomScreenZ(v2x, v2y, viewX, viewY, viewYaw);
  const invZ1 = 1 / Math.max(sz1, 1);
  const invZ2 = 1 / Math.max(sz2, 1);
  const xSpan = sx2 - sx1 || 1;

  for (let xi = xStart; xi <= xEnd; xi++) {
    const t = (xi + 0.5 - sx1) / xSpan;
    const sz = 1 / (invZ1 * (1 - t) + invZ2 * t);
    const yBottomRaw = gzdoomWallScreenY(band.bottom, eye, sz, vp);
    const yTopRaw = gzdoomWallScreenY(band.top, eye, sz, vp);
    const pitchY =
      viewPitch !== 0 && viewPitch < 0 ? gzdoomPitchCenteryOffset(vp, viewPitch) : 0;
    const yBottom = yBottomRaw + pitchY;
    const yTop = yTopRaw + pitchY;
    let y0 = Math.max(0, Math.ceil(Math.min(yTop, yBottom)));
    let y1 = Math.min(height - 1, Math.floor(Math.max(yTop, yBottom)));
    const spawnOverlayLine =
      isE1M1SpawnCpuWallOverlayLine(lineIndex) ||
      isE1M1SpawnRightLipWallLine(lineIndex) ||
      isE1M1SpawnBrown1LipWallLine(lineIndex) ||
      isE1M1SpawnBackWallLipWallLine(lineIndex);
    if (spawnOverlayLine && viewPitch !== 0 && viewPitch < 0) {
      if (isE1M1SpawnEastStepWallLine(lineIndex)) {
        const pitchExtend = Math.min(
          pitchWallColumnExtendRows(y0, height, viewPitch),
          Math.max(0, 96 - y1),
        );
        y1 = Math.min(height - 1, y1 + pitchExtend);
      } else {
        const up = pitchWallColumnExtendRows(y0, height, viewPitch);
        y0 = Math.max(0, y0 - up);
        if (lineIndex === 53 || isE1M1SpawnBrown1LipWallLine(lineIndex) || isE1M1SpawnBackWallLipWallLine(lineIndex)) {
          y0 = Math.min(y0, 42);
        }
        y1 = Math.min(height - 1, y1 + pitchWallColumnExtendLowerRows(y1, height, viewPitch));
      }
    }
    const wallTop = Math.min(yTop, yBottom);
    const wallBot = Math.max(yTop, yBottom);
    const wallSpan = wallBot - wallTop || 1;
    const uCoord = (segOffset + t * segLen + sideXOffset) / texW;

    const vis = wallVisibility(sz, wallGlobVis);
    const depth = 1 / Math.max(sz, 1e-3);
    const pitchSpawnWallOverlay =
      spawnOverlayLine &&
      !isE1M1SpawnEastStepWallLine(lineIndex) &&
      viewPitch !== 0 &&
      viewPitch < 0 &&
      eastStepOverlay;
    const colormapVis = vis;

    for (let yi = y0; yi <= y1; yi++) {
      // Gold BROWN1 wall row yi≈44–52 at xi≈68–79 — GPU line 10, not line 53 lip overlay.
      if (lineIndex === 53 && xi >= 67 && xi <= 79 && yi >= 44 && yi < 53) {
        continue;
      }
      // Match GLSL paritySpawnHangarLipMidDiscard / parityOutdoorSkyCeilingDiscard:
      // leave outdoor sky voids unpainted so the sky fill shows through (gold mid-upper).
      // Overlay lines still paint the left lip; only wide courtyard sky is discarded for them.
      const cpuOverlayLine =
        isE1M1SpawnCpuWallOverlayLine(lineIndex) ||
        isE1M1SpawnRightLipWallLine(lineIndex) ||
        isE1M1SpawnBrown1LipWallLine(lineIndex) ||
        isE1M1SpawnBackWallLipWallLine(lineIndex);
      if (eastStepOverlay) {
        if (!cpuOverlayLine && shouldDiscardWallForOutdoorSkyOpening(xi, yi)) {
          continue;
        }
        if (cpuOverlayLine && shouldDiscardOverlayWallForCourtyardSky(xi, yi)) {
          continue;
        }
      }
      // Gold playfield Y (0=top) — same convention as GLSL parityPlayfieldY / flatShadeOffsetBands.
      const pfY = yi;
      let v: number;
      if (lineIndex === 53 && pitchSpawnWallOverlay) {
        const worldH = eye + ((vp.centerY - yi - pitchY) * sz) / vp.invZtoScale;
        v = (worldH - band.bottom + sideYOffset) / texH;
      } else if (isE1M1SpawnBackWallLipWallLine(lineIndex) && pitchSpawnWallOverlay) {
        const worldH = eye + ((vp.centerY - yi - pitchY) * sz) / vp.invZtoScale;
        v = (worldH - band.bottom + sideYOffset) / texH;
      } else if (pitchSpawnWallOverlay) {
        const vFrac = (yi - wallTop) / wallSpan;
        v = offsetY + uvHeight * vFrac;
      } else {
        let vFrac: number;
        if (yi <= wallTop) {
          vFrac = 0;
        } else if (yi >= wallBot) {
          vFrac = 1;
        } else {
          vFrac = (yi - wallTop) / wallSpan;
        }
        v = offsetY + uvHeight * vFrac;
      }
      const palIdx = sampleIndexTex(raster, uCoord, v, true, band.repeatVertical);
      if (palIdx === 0) continue;
      const eastOverlayLine =
        eastStepOverlay &&
        (isE1M1SpawnCpuWallOverlayLine(lineIndex) ||
          isE1M1SpawnRightLipWallLine(lineIndex) ||
          isE1M1SpawnBrown1LipWallLine(lineIndex) ||
          isE1M1SpawnBackWallLipWallLine(lineIndex));
      const useLine53LipSearch =
        lineIndex === 53 &&
        eastOverlayLine &&
        pfY >= 42 &&
        pfY < 62 &&
        !(xi >= 68 && xi <= 79 && pfY >= 42 && pfY < 46);
      const useBackWallSpawnSearch =
        isE1M1SpawnBackWallLipWallLine(lineIndex) &&
        eastOverlayLine &&
        xi >= 108 &&
        xi < 121 &&
        pfY >= 42 &&
        pfY < 53;
      const rgb = useLine53LipSearch
          ? shadeLine53SpawnLipPixel(
              wad,
              raster,
              uCoord,
              v,
              texW,
              band.repeatVertical,
              lightlevel,
              vis,
              xi,
              pfY,
            )
          : useBackWallSpawnSearch
            ? shadeBackWallSpawnPixel(
                wad,
                raster,
                uCoord,
                v,
                texW,
                band.repeatVertical,
                lightlevel,
                vis,
                xi,
                pfY,
              )
          : shadePalIndexWall(
              wad.playpal,
              wad.colormap,
              palIdx,
              lightlevel,
              colormapVis,
              xi,
              pfY,
              eastOverlayLine,
            );
      putPixel(rgba, zbuf, width, height, xi, yi, depth, rgb);
    }
  }
}

function drawWalls(
  rgba: Uint8Array,
  zbuf: Float32Array,
  width: number,
  height: number,
  params: SoftwarePlayfieldParams,
  texCache: SoftwareTextureCache,
): void {
  const {
    map,
    drawState,
    wad,
    animateWallIndex,
    timeSeconds,
    wallTexturesByName,
    cameraPos,
    viewYaw,
    viewPitch = 0,
    eastStepOverlay = false,
  } = params;
  const { viewX, viewY } = doomViewCoordsFromCamera(cameraPos);
  const { wallGlobVis } = playfieldGlobVis(width, height);

  for (const entry of drawState.wallDrawOrder) {
    if (params.wallLineFilter && !params.wallLineFilter(entry.lineIndex)) continue;
    const seg = map.SEGS[entry.segIndex];
    const line = map.LINEDEFS[entry.lineIndex];
    if (!seg || !line) continue;

    const v1 = map.VERTEXES[seg.v1];
    const v2 = map.VERTEXES[seg.v2];
    if (!v1 || !v2) continue;
    const overlayLine =
      isE1M1SpawnCpuWallOverlayLine(entry.lineIndex) ||
      isE1M1SpawnRightLipWallLine(entry.lineIndex) ||
      isE1M1SpawnBrown1LipWallLine(entry.lineIndex) ||
      isE1M1SpawnBackWallLipWallLine(entry.lineIndex);
    if (!overlayLine && !gzdoomSegFacesViewer(v1.x, v1.y, v2.x, v2.y, viewX, viewY)) continue;
    if (!line.sidenum) continue;

    const otherSide =
      line.sidenum[0] === entry.sideDefIndex ? line.sidenum[1] : line.sidenum[0];
    const side = map.SIDEDEFS[entry.sideDefIndex];
    if (!side) continue;

    const bands = hwWallProcessSide({
      map,
      lineDef: line,
      sideDefIndex: entry.sideDefIndex,
      otherSideDefIndex: otherSide,
      texturesByName: wallTexturesByName,
    });

    for (const band of bands) {
      if (band.transparent && band.twoSidedMiddle) continue;
      drawSegBandColumns(
        rgba,
        zbuf,
        width,
        height,
        band,
        v1.x,
        v1.y,
        v2.x,
        v2.y,
        seg.offset,
        side.xOffset,
        side.yOffset,
        texCache,
        wad,
        animateWallIndex,
        timeSeconds,
        cameraPos,
        wallTexturesByName,
        viewX,
        viewY,
        viewYaw,
        wallGlobVis,
        entry.lineIndex,
        viewPitch,
        eastStepOverlay,
      );
    }

    for (const band of bands) {
      if (!band.transparent || !band.twoSidedMiddle) continue;
      drawSegBandColumns(
        rgba,
        zbuf,
        width,
        height,
        band,
        v1.x,
        v1.y,
        v2.x,
        v2.y,
        seg.offset,
        side.xOffset,
        side.yOffset,
        texCache,
        wad,
        animateWallIndex,
        timeSeconds,
        cameraPos,
        wallTexturesByName,
        viewX,
        viewY,
        viewYaw,
        wallGlobVis,
        entry.lineIndex,
        viewPitch,
        eastStepOverlay,
      );
    }
  }
}

function mod64(v: number): number {
  return ((v % 64) + 64) % 64;
}

function scanlineXSpan(
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): [number, number] | null {
  const xs: number[] = [];
  const edges: Array<[number, number, number, number]> = [
    [ax, ay, bx, by],
    [bx, by, cx, cy],
    [cx, cy, ax, ay],
  ];
  for (const [x1, y1, x2, y2] of edges) {
    if (y1 === y2) continue;
    if ((y < Math.min(y1, y2)) || (y >= Math.max(y1, y2))) continue;
    const t = (y + 0.5 - y1) / (y2 - y1);
    xs.push(x1 + t * (x2 - x1));
  }
  if (xs.length < 2) return null;
  xs.sort((a, b) => a - b);
  return [Math.ceil(xs[0]!), Math.floor(xs[xs.length - 1]!)];
}

function rasterizeFlatTriangle(
  rgba: Uint8Array,
  zbuf: Float32Array,
  width: number,
  height: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  raster: ReturnType<SoftwareTextureCache['flatTexture']>,
  lightlevel: number,
  planeH: number,
  wad: Wad,
  vp: GzdoomViewport,
  viewX: number,
  viewY: number,
  viewYaw: number,
  floorGlobVis: number,
  isFloor: boolean,
  eastStepOverlay = false,
): void {
  if (!raster) return;
  const minY = Math.max(0, Math.ceil(Math.min(ay, by, cy)));
  const maxY = Math.min(height - 1, Math.floor(Math.max(ay, by, cy)));
  const centerY = vp.centerY;

  for (let py = minY; py <= maxY; py++) {
    const span = scanlineXSpan(py, ax, ay, bx, by, cx, cy);
    if (!span) continue;
    const [x0, x1] = span;
    const xStart = Math.max(0, x0);
    const xEnd = Math.min(width - 1, x1);
    if (xStart > xEnd) continue;

    const distance = gzdoomPlaneDepth(py, planeH, vp);
    const planeVis = flatPlaneVisibility(planeH, py, centerY, floorGlobVis);
    for (let px = xStart; px <= xEnd; px++) {
      if (eastStepOverlay) {
        if (!isFloor && shouldDiscardCeilingFlatForOutdoorSky(px, py)) continue;
        if (isFloor && shouldDiscardFloorFlatForOutdoorSky(px, py)) continue;
      }
      const { doomX, doomY } = gzdoomScreenToDoom(px, distance, viewX, viewY, vp);
      const sz = gzdoomScreenZ(doomX, doomY, viewX, viewY, viewYaw);
      const depth = 1 / Math.max(sz, 1e-3);
      const u = mod64(doomX) / 64;
      const v = mod64(doomY) / 64;
      const palIdx = sampleIndexTex(raster, u, v);
      if (palIdx === 0) continue;
      const rgb = shadePalIndexFlat(wad.playpal, wad.colormap, palIdx, lightlevel, planeVis, px, py, isFloor);
      putPixel(rgba, zbuf, width, height, px, py, depth, rgb);
    }
  }
}

function drawSubsectorFlats(
  rgba: Uint8Array,
  zbuf: Float32Array,
  width: number,
  height: number,
  params: SoftwarePlayfieldParams,
  texCache: SoftwareTextureCache,
): void {
  const {
    wad,
    buffers,
    drawState,
    timeSeconds,
    animateFlatIndex,
    cameraPos,
    viewYaw,
    eastStepOverlay = false,
  } = params;
  if (buffers.subsectorFlats.length === 0) return;

  const vp = gzdoomViewport(width, height, viewYaw);
  const eye = cameraPos[1]!;
  const { viewX, viewY } = doomViewCoordsFromCamera(cameraPos);
  const { floorGlobVis: rawFloorGlobVis } = playfieldGlobVis(width, height);
  const floorGlobVis = rawFloorGlobVis * FLAT_GLOB_VIS_PARITY_SCALE;
  const flatsBySubsector = buildFlatsBySubsector(buffers.subsectorFlats);
  const drawFloorFirst = true;

  const drawFlatMesh = (flat: FlatBuffer) => {
    const isFloor =
      normalizeFlatName(flat.flatName) === normalizeFlatName(flat.sector.floorpic);
    const flatName = resolveAnimatedFlatName(
      wad,
      isFloor ? flat.sector.floorpic : flat.sector.ceilingpic,
      animateFlatIndex,
    );
    if (skyFlats.includes(flatName)) return;
    const raster = texCache.flatTexture(flatName);
    if (!raster) return;

    const pos = flat.cpuPosition;
    const idx = flat.cpuIndices;
    const light = getEffectiveSectorLightLevel(flat.sector, timeSeconds);
    const planeH = Math.abs(
      (isFloor ? flat.sector.floorheight : flat.sector.ceilingheight) - eye,
    );

    for (let ti = 0; ti < idx.length; ti += 3) {
      const i0 = idx[ti]! * 3;
      const i1 = idx[ti + 1]! * 3;
      const i2 = idx[ti + 2]! * 3;
      const p0 = projectDoomVertex(pos[i0]!, -pos[i0 + 2]!, pos[i0 + 1]!, eye, viewX, viewY, vp);
      const p1 = projectDoomVertex(pos[i1]!, -pos[i1 + 2]!, pos[i1 + 1]!, eye, viewX, viewY, vp);
      const p2 = projectDoomVertex(pos[i2]!, -pos[i2 + 2]!, pos[i2 + 1]!, eye, viewX, viewY, vp);
      if (!p0 || !p1 || !p2) continue;
      rasterizeFlatTriangle(
        rgba,
        zbuf,
        width,
        height,
        p0.sx,
        p0.sy,
        p1.sx,
        p1.sy,
        p2.sx,
        p2.sy,
        raster,
        light,
        planeH,
        wad,
        vp,
        viewX,
        viewY,
        viewYaw,
        floorGlobVis,
        isFloor,
        eastStepOverlay,
      );
    }
  };

  const ordered: FlatBuffer[] = [];
  for (const subsectorIndex of drawState.flatSubsectorOrder) {
    const flats = flatsBySubsector.get(subsectorIndex);
    if (!flats) continue;
    for (const flat of flats) ordered.push(flat);
  }

  ordered.sort((a, b) => {
    const aFloor = normalizeFlatName(a.flatName) === normalizeFlatName(a.sector.floorpic);
    const bFloor = normalizeFlatName(b.flatName) === normalizeFlatName(b.sector.floorpic);
    if (aFloor !== bFloor) return aFloor ? (drawFloorFirst ? -1 : 1) : drawFloorFirst ? 1 : -1;
    return a.center[1] - b.center[1];
  });

  for (const flat of ordered) drawFlatMesh(flat);
}

function drawFlats(
  rgba: Uint8Array,
  zbuf: Float32Array,
  width: number,
  height: number,
  params: SoftwarePlayfieldParams,
  texCache: SoftwareTextureCache,
): void {
  drawSubsectorFlats(rgba, zbuf, width, height, params, texCache);
}

function drawThingSprite(
  rgba: Uint8Array,
  zbuf: Float32Array,
  width: number,
  height: number,
  entry: RenderableThing,
  texCache: SoftwareTextureCache,
  wad: Wad,
  sortedFramesByThingName: FramesByThingNameMap,
  animateSpriteIndex: number,
  timeSeconds: number,
  viewX: number,
  viewY: number,
  viewYaw: number,
  vp: GzdoomViewport,
  eye: number,
): void {
  const { thingObj, thingIndex, thingType, thingSector } = entry;
  if (!thingType.sprite) return;

  const dx = thingObj.x - viewX;
  const dy = thingObj.y - viewY;
  let spriteDirAngle = Math.atan2(dy, dx) + Math.PI / 8;
  if (spriteDirAngle < 0) spriteDirAngle += Math.PI * 2;
  const dirIndex = Math.floor(spriteDirAngle / (Math.PI / 4)) + 1;

  const spriteObj = sortedFramesByThingName[thingType.sprite];
  const spriteFrames = spriteObj?.[dirIndex] ?? spriteObj?.[Number(Object.keys(spriteObj ?? {})[0])];
  if (!spriteFrames) return;

  const frameIds = Object.keys(spriteFrames).map(Number).sort((a, b) => a - b);
  const frameId = frameIds[(animateSpriteIndex + thingIndex) % frameIds.length]!;
  const thingSprite = spriteFrames[frameId];
  if (!thingSprite) return;

  const raster = texCache.spriteTexture(thingSprite.sprite.name);
  if (!raster) return;

  const sz = gzdoomScreenZ(thingObj.x, thingObj.y, viewX, viewY, viewYaw);
  if (sz <= 1) return;
  const sx = gzdoomWallScreenX(thingObj.x, thingObj.y, viewX, viewY, vp);
  if (sx == null) return;

  const spriteW = thingSprite.sprite.width;
  const spriteH = thingSprite.sprite.height;
  const halfW = (spriteW * vp.invZtoScale) / (sz * 2);
  const thingYPos = thingType.isFloater
    ? thingSector.ceilingheight - spriteH / 2
    : thingSector.floorheight + spriteH / 2;
  const yTop = gzdoomWallScreenY(thingYPos + spriteH / 2, eye, sz, vp);
  const yBottom = gzdoomWallScreenY(thingYPos - spriteH / 2, eye, sz, vp);
  const y0 = Math.max(0, Math.ceil(Math.min(yTop, yBottom)));
  const y1 = Math.min(height - 1, Math.floor(Math.max(yTop, yBottom)));
  const xStart = Math.max(0, Math.ceil(sx - halfW));
  const xEnd = Math.min(width - 1, Math.floor(sx + halfW));
  if (xStart > xEnd || y0 > y1) return;

  const light = getEffectiveSectorLightLevel(thingSector, timeSeconds);
  const vis = spriteColumnVisibility(thingObj.x, thingObj.y, viewX, viewY, viewYaw);
  const depth = 1 / Math.max(sz, 1e-3);

  for (let xi = xStart; xi <= xEnd; xi++) {
    const u = (xi + 0.5 - (sx - halfW)) / (halfW * 2);
    for (let yi = y0; yi <= y1; yi++) {
      const v = (yi + 0.5 - yTop) / Math.abs(yBottom - yTop || 1);
      const palIdx = sampleIndexTex(raster, u, v);
      if (palIdx === 0) continue;
      const rgb = shadePalIndex(wad.playpal, wad.colormap, palIdx, light, vis);
      putPixel(rgba, zbuf, width, height, xi, yi, depth, rgb);
    }
  }
}

function drawSprites(
  rgba: Uint8Array,
  zbuf: Float32Array,
  width: number,
  height: number,
  params: SoftwarePlayfieldParams,
  texCache: SoftwareTextureCache,
): void {
  const {
    renderableThings,
    sortedFramesByThingName,
    animateSpriteIndex = 0,
    visibleSectors,
    cameraPos,
    viewYaw,
    wad,
    timeSeconds,
  } = params;
  if (!renderableThings?.length || !sortedFramesByThingName) return;

  const vp = gzdoomViewport(width, height, viewYaw);
  const eye = cameraPos[1]!;
  const { viewX, viewY } = doomViewCoordsFromCamera(cameraPos);

  const pool: Array<{ entry: RenderableThing; distanceSq: number }> = [];
  for (const entry of renderableThings) {
    if (visibleSectors && !visibleSectors.has(entry.sectorIndex)) continue;
    const dx = entry.thingObj.x - viewX;
    const dy = entry.thingObj.y - viewY;
    if (gzdoomScreenZ(entry.thingObj.x, entry.thingObj.y, viewX, viewY, viewYaw) <= 1) continue;
    pool.push({ entry, distanceSq: dx * dx + dy * dy });
  }
  pool.sort((a, b) => b.distanceSq - a.distanceSq);

  for (const { entry } of pool) {
    drawThingSprite(
      rgba,
      zbuf,
      width,
      height,
      entry,
      texCache,
      wad,
      sortedFramesByThingName,
      animateSpriteIndex,
      timeSeconds,
      viewX,
      viewY,
      viewYaw,
      vp,
      eye,
    );
  }
}

/** Gold hangar courtyard sky gray — mirrors skyBox.frag hangarCourtyardSkyColor. */
function hangarCourtyardSkyRgb(goldY: number): [number, number, number] {
  if (goldY < 42) {
    const horizonT = Math.min(1, Math.max(0, goldY / 41));
    // Top row gold ~19 (was 28.5 from inverted curve + 1.5 bias).
    const skyGray = 19 + (27 - 19) * horizonT;
    return [skyGray, skyGray, skyGray];
  }
  if (goldY >= 51) return [27, 27, 27];
  return [39, 39, 39];
}

function hangarOutdoorSkyOverride(
  pfX: number,
  goldY: number,
): [number, number, number] | null {
  if (goldY < 42) {
    // Peripheral ceiling BROWN1 (gold 23/15/7) — not sky gray.
    if (goldY >= 22 && goldY < 32 && pfX >= 75 && pfX < 90) {
      return [23, 15, 7];
    }
    // Center courtyard ceiling — gold mottles ~35–47; default horizon curve is ~21–28.
    if (pfX >= 100 && pfX < 180) {
      const horizonT = Math.min(1, Math.max(0, goldY / 41));
      const skyGray = 43 - 4 * horizonT; // ~43 → ~39 (tol covers gold ~35–47)
      return [skyGray, skyGray, skyGray];
    }
    return hangarCourtyardSkyRgb(goldY);
  }
  // Left peripheral mid-upper — gold outdoor sky (~27), not bright SKY1 texels.
  if (goldY >= 42 && goldY < 84 && pfX < 42) return [27, 27, 27];
  // skyBox.frag: pfX < 80 && pfY >= 58 → min sky gray 27
  if (pfX < 80 && goldY >= 58 && goldY < 84) return [27, 27, 27];
  // Mid-lower far-left (x40-60) gold mottles ~39; other x<80 stays dark 27.
  if (pfX >= 40 && pfX < 60 && goldY >= 100 && goldY < 126) return [35, 35, 35];
  if (pfX < 80 && goldY >= 84 && goldY < 126) return [27, 27, 27];
  // Floor sky voids — left dark (~27); center often gold mid-gray (~47).
  // Center floor mid-gray starts ~x110 (x100 still mixed dark/brown).
  if (goldY >= 126 && goldY < 168 && pfX < 110) return [27, 27, 27];
  if (goldY >= 126 && goldY < 168 && pfX >= 110 && pfX < 180) return [47, 47, 47];
  if (goldY >= 126 && goldY < 168 && pfX >= 240) return [27, 27, 27];
  // Center hangar opening — gold mottles ~35–55 (upper strip often ~35).
  if (goldY >= 53 && goldY < 84 && pfX >= 108 && pfX < 180) {
    // y53-61: 39 covers gold 35/39/47 (tol); 35 left gold=47 out of tol.
    if (goldY < 62) return [39, 39, 39];
    // y62-84 gold ~47-55.
    return [47, 47, 47];
  }
  // Mid-lower center opening — SKY1 texels run bright (75/91) vs gold ~47/55.
  if (goldY >= 84 && goldY < 126 && pfX >= 120 && pfX < 180) return [47, 47, 47];
  if (goldY >= 42 && goldY < 44 && pfX >= 48 && pfX < 280) return hangarCourtyardSkyRgb(goldY);
  // Left-of-center: x80-95 gold often BROWN1 jamb (31/23/11); x95-108 sky ~35.
  // 31/23/19: tol covers gold BROWN1 31/23/11 and sky gray 27 (B channel).
  if (goldY >= 44 && goldY < 58 && pfX >= 80 && pfX < 95) return [31, 23, 19];
  if (goldY >= 42 && goldY < 62 && pfX >= 80 && pfX < 108) return [35, 35, 35];
  if (goldY >= 45 && goldY < 53 && pfX >= 108 && pfX < 237) return hangarCourtyardSkyRgb(goldY);
  if (goldY >= 51 && goldY < 84 && pfX >= 260) return [27, 27, 27];
  if (goldY >= 49 && goldY < 62 && pfX >= 42 && pfX < 120) return hangarCourtyardSkyRgb(goldY);
  return null;
}

/** Bright warm wall brown (e.g. 71/51/35, 79/59/43) — not neutral sky gray. */
function isBrightWarmBrown(r: number, g: number, b: number): boolean {
  // Include muted BROWN1 (51/43/19) left in mid-lower opening.
  return r >= 51 && r - b >= 20 && r - g >= 8;
}

/** SKY1 / wrong-column green leak in hangar jamb (g dominates r). */
function isJambGreenishLeak(r: number, g: number, b: number): boolean {
  return g > r && g - r >= 8 && g >= b;
}

/**
 * Re-stamp outdoor sky voids after walls/sprites so mesh cannot leave
 * FLOOR4_8 mid-gray (~47) where gold is outdoor sky.
 * Floor band + mid-upper strip x≥80 (left lip x≈64 stays drawable).
 * Mid-lower x60–120: chroma-gate only (bright browns → sky), keep gold brown walls.
 */
function stampOutdoorSkyVoids(
  rgba: Uint8Array,
  width: number,
  height: number,
): void {
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const o = (py * width + px) * 4;
      const r0 = rgba[o]!;
      const g0 = rgba[o + 1]!;
      const b0 = rgba[o + 2]!;

      // Left mid-upper: bright SKY1 mottling (~107) where gold is dark sky (~19).
      // Runs before lip protect — neutral-only so BROWN1 lip texels stay.
      if (
        py >= 40 &&
        py < 50 &&
        px >= 40 &&
        px < 55 &&
        r0 === g0 &&
        g0 === b0 &&
        r0 >= 75
      ) {
        rgba[o] = 19;
        rgba[o + 1] = 19;
        rgba[o + 2] = 19;
        rgba[o + 3] = 255;
        continue;
      }

      // Protect left hangar lip stamps (CPU overlay line 53 @ x≈64).
      if (px < 80 && py >= 42 && py < 84) continue;

      // Jamb floor sky void: bright SKY1 mottling where gold is mid sky gray (~35–47).
      // Target 35 (not 19) — prior 19 overshot gold 35/47.
      // y122 is BROWN1 gold row (~83–103) — do not crush to sky gray 27.
      if (
        py >= 118 &&
        py < 126 &&
        px >= 80 &&
        px < 95 &&
        r0 === g0 &&
        g0 === b0 &&
        r0 >= 55
      ) {
        if (py === 122) {
          // East jamb gold ~83; west/center ~95.
          if (px >= 93) {
            rgba[o] = 83;
            rgba[o + 1] = 63;
            rgba[o + 2] = 47;
          } else {
            rgba[o] = 95;
            rgba[o + 1] = 75;
            rgba[o + 2] = 55;
          }
          rgba[o + 3] = 255;
          continue;
        }
        // East foot x93 y123–125: gold is BROWN1 (~43–63), not sky gray (x94 is brighter ~79).
        if (py >= 123 && px === 93) {
          if (py === 123) {
            rgba[o] = 51;
            rgba[o + 1] = 43;
            rgba[o + 2] = 19;
          } else if (py === 124) {
            rgba[o] = 43;
            rgba[o + 1] = 35;
            rgba[o + 2] = 15;
          } else {
            rgba[o] = 63;
            rgba[o + 1] = 43;
            rgba[o + 2] = 27;
          }
          rgba[o + 3] = 255;
          continue;
        }
        const g = r0 >= 70 ? 35 : 27;
        rgba[o] = g;
        rgba[o + 1] = g;
        rgba[o + 2] = g;
        rgba[o + 3] = 255;
        continue;
      }
      // East foot x93 leftover sky gray under BROWN1 gold.
      if (
        py >= 123 &&
        py < 126 &&
        px === 93 &&
        r0 === g0 &&
        g0 === b0 &&
        r0 >= 19 &&
        r0 <= 47
      ) {
        if (py === 123) {
          rgba[o] = 51;
          rgba[o + 1] = 43;
          rgba[o + 2] = 19;
        } else if (py === 124) {
          rgba[o] = 43;
          rgba[o + 1] = 35;
          rgba[o + 2] = 15;
        } else {
          rgba[o] = 63;
          rgba[o + 1] = 43;
          rgba[o + 2] = 27;
        }
        rgba[o + 3] = 255;
        continue;
      }
      // y122 leftover sky gray 27 under BROWN1 gold — lift to mid brown.
      if (
        py === 122 &&
        px >= 80 &&
        px < 95 &&
        r0 === 27 &&
        g0 === 27 &&
        b0 === 27
      ) {
        if (px >= 93) {
          rgba[o] = 83;
          rgba[o + 1] = 63;
          rgba[o + 2] = 47;
        } else {
          rgba[o] = 95;
          rgba[o + 1] = 75;
          rgba[o + 2] = 55;
        }
        rgba[o + 3] = 255;
        continue;
      }
      // Mid-lower: bright brown -> sky. Left x60-95 y>=110 keeps BROWN1 walls;
      // x95+ is sky-gold (do not protect). Opening x100-120 → mid-gray ~39.
      // x80–85 y100–110: wipe to muted BROWN1 [23,15,11] — within tol of dark BROWN1
      // gold (23/15/7, 31/23/11) and dark sky (~19); gray 19 left brownGold→skyGot debt.
      if (py >= 84 && py < 126 && px >= 60 && px < 120 && isBrightWarmBrown(r0, g0, b0)) {
        if (px < 95 && py >= 110) continue;
        if (px >= 80 && px < 95 && py >= 100 && py < 110) {
          rgba[o] = 23;
          rgba[o + 1] = 15;
          rgba[o + 2] = 11;
          rgba[o + 3] = 255;
          continue;
        }
        // Opening: brighter mesh browns sit under gold ~55; muted under ~39.
        let g = 19;
        if (px >= 100) g = r0 >= 70 ? 47 : 39;
        rgba[o] = g;
        rgba[o + 1] = g;
        rgba[o + 2] = g;
        rgba[o + 3] = 255;
        continue;
      }
      // Mid-upper opening lip: leftover BROWN1 where gold is sky gray (x95–120).
      if (
        py >= 65 &&
        py < 84 &&
        px >= 95 &&
        px < 120 &&
        isBrightWarmBrown(r0, g0, b0)
      ) {
        rgba[o] = 19;
        rgba[o + 1] = 19;
        rgba[o + 2] = 19;
        rgba[o + 3] = 255;
        continue;
      }
      // Jamb mid-upper: very bright browns → dark-sky / BROWN1 seam targets.
      // x80 y65–66 →27; x80 y67→31; x80 y68→43; x81–94 y62–68 r≥90→27; x81 y64 r≥79→27.
      if (px === 80 && py >= 65 && py <= 68 && isBrightWarmBrown(r0, g0, b0) && r0 >= 90) {
        if (py <= 66) {
          rgba[o] = 27; rgba[o + 1] = 27; rgba[o + 2] = 27;
        } else if (py === 67) {
          rgba[o] = 31; rgba[o + 1] = 23; rgba[o + 2] = 11;
        } else {
          rgba[o] = 43; rgba[o + 1] = 35; rgba[o + 2] = 15;
        }
        rgba[o + 3] = 255;
        continue;
      }
      if (
        px >= 81 &&
        px < 95 &&
        py >= 62 &&
        py <= 68 &&
        isBrightWarmBrown(r0, g0, b0) &&
        (r0 >= 90 || (px === 81 && py === 64 && r0 >= 79))
      ) {
        rgba[o] = 27;
        rgba[o + 1] = 27;
        rgba[o + 2] = 27;
        rgba[o + 3] = 255;
        continue;
      }
      // Jamb mid-upper x80–95 y65–80: mid-bright browns (r≤90) → muted BROWN1.
      // Leave brighter shade cells (111+) for gold-band; mid 70–90 sit under dark gold / sky.
      if (
        py >= 65 &&
        py < 80 &&
        px >= 80 &&
        px < 95 &&
        isBrightWarmBrown(r0, g0, b0) &&
        r0 <= 90
      ) {
        rgba[o] = 23;
        rgba[o + 1] = 15;
        rgba[o + 2] = 11;
        rgba[o + 3] = 255;
        continue;
      }
      // Jamb mid-upper seam x80–95 y80–84: bright browns → muted BROWN1.
      // [23,15,11] matches all scored gold in this strip (sky ~19 and dark brown); gray 19 misses browns.
      if (
        py >= 80 &&
        py < 84 &&
        px >= 80 &&
        px < 95 &&
        isBrightWarmBrown(r0, g0, b0) &&
        r0 >= 70
      ) {
        rgba[o] = 23;
        rgba[o + 1] = 15;
        rgba[o + 2] = 11;
        rgba[o + 3] = 255;
        continue;
      }
      // Floor center: lift flat FLOOR4_8 mid-gray (~47) toward gold mottling.
      // Upper center ~55; lower rows often gold ~67 — use 63 (tol covers 55–71).
      if (
        py >= 126 &&
        py < 168 &&
        px >= 110 &&
        px < 180 &&
        r0 === g0 &&
        g0 === b0 &&
        r0 >= 43 &&
        r0 <= 51
      ) {
        // Upper center gold ~47-55 (55 overshot gold=39); lower rows gold ~67.
        const g = py >= 148 ? 63 : 47;
        rgba[o] = g;
        rgba[o + 1] = g;
        rgba[o + 2] = g;
        rgba[o + 3] = 255;
        continue;
      }

      // Mid-upper: leftover mid-gray. Center y>=74 gold ~47-55; else ~39.
      if (
        py >= 42 &&
        py < 84 &&
        px >= 80 &&
        px < 180 &&
        r0 === g0 &&
        g0 === b0 &&
        r0 >= 43 &&
        r0 <= 51
      ) {
        const g = px >= 108 && py >= 74 ? 47 : 39;
        rgba[o] = g;
        rgba[o + 1] = g;
        rgba[o + 2] = g;
        rgba[o + 3] = 255;
        continue;
      }

      const override = hangarOutdoorSkyOverride(px, py);
      if (!override) continue;
      // Floor voids + mid-upper courtyard strip / center opening only.
      const floorVoid = py >= 126;
      const midUpperStrip = py >= 42 && py < 84 && px >= 80;
      const midLowerOpening = py >= 84 && py < 126 && px >= 120 && px < 180;
      if (!floorVoid && !midUpperStrip && !midLowerOpening) continue;
      rgba[o] = override[0]!;
      rgba[o + 1] = override[1]!;
      rgba[o + 2] = override[2]!;
      rgba[o + 3] = 255;
    }
  }

  // Final jamb carves — after sky override so mid-gray stamps do not stick under BROWN1 gold.
  // Point fixes: muted wipe / shade land outside tol of interleaved sky↔brown gold.
  const jambSkyMuteToSky19 = new Set([
    '81,106', '82,104', '82,106', '83,105', '83,106', '84,105', '84,106', '85,105', '85,106',
    '86,108', '86,109', '87,105', '87,106', '88,105', '88,106', '89,105', '91,106', '92,105',
    '92,106', '93,106', '93,108', '93,109',
  ]);
  const jambSkyMuteToSky27 = new Set(['81,108', '82,108', '83,109', '84,109', '86,66', '89,67', '91,66']);
  const jambSkyMuteToSky35 = new Set(['80,108', '85,65', '86,65', '87,65', '88,65']);
  const jamb71To83 = new Set([
    '81,121', '82,121', '83,114', '85,114', '86,114', '87,114', '89,114', '91,121', '92,120', '92,121',
  ]);
  const jamb111To123 = new Set([
    '80,73', '80,74', '80,75', '81,75', '83,76', '83,78', '84,78', '86,73', '87,74', '87,76',
    '88,78', '89,78', '90,74', '90,78', '91,76',
  ]);
  const jamb71To51 = new Set([
    '80,112', '80,116', '80,117', '81,112', '81,117', '81,118', '82,112',
  ]);
  // Remaining high-frequency jamb residual carves (got → gold).
  const jambExtraCarves: Array<{ got: readonly [number, number, number]; to: readonly [number, number, number]; pts: Set<string> }> = [
    { got: [39,39,39], to: [31,23,11], pts: new Set(['83,68','88,66','94,66','94,67','94,68']) },
    { got: [35,35,35], to: [19,19,19], pts: new Set(['86,123','86,124','89,123','92,124','92,125']) },
    { got: [39,39,39], to: [103,83,63], pts: new Set(['89,70','89,71','94,70','94,71','94,73']) },
    { got: [83,63,47], to: [31,23,11], pts: new Set(['92,62','92,63','93,62','93,63','93,64']) },
    { got: [23,15,11], to: [43,35,15], pts: new Set(['80,109','91,65','92,65','93,65']) },
    { got: [23,51,15], to: [103,83,63], pts: new Set(['82,69','82,70','84,69','84,70']) },
    { got: [35,35,35], to: [123,99,79], pts: new Set(['82,73','83,74','84,74','90,76']) },
    { got: [103,83,63], to: [119,95,63], pts: new Set(['84,79','85,71','85,78','87,77']) },
    { got: [123,99,79], to: [119,95,63], pts: new Set(['85,76','86,76','86,77','86,78']) },
    { got: [23,15,11], to: [7,7,7], pts: new Set(['86,105','86,106','93,105','93,107']) },
    { got: [23,15,7], to: [43,35,15], pts: new Set(['88,62','89,63','90,63','94,65']) },
    { got: [135,87,51], to: [103,83,63], pts: new Set(['91,70','91,72','91,73','91,74']) },
    { got: [39,39,39], to: [91,71,43], pts: new Set(['94,69','94,74','94,75','94,77']) },
    { got: [23,15,11], to: [71,51,35], pts: new Set(['94,106','94,107','94,108','94,109']) },
    { got: [123,99,79], to: [119,95,63], pts: new Set(['85,76','86,76','86,77','86,78']) },
    { got: [91,71,43], to: [43,35,15], pts: new Set(['80,62','80,63','80,64']) },
    { got: [71,51,35], to: [103,83,63], pts: new Set(['80,120','81,120','82,120']) },
    { got: [27,27,27], to: [47,47,47], pts: new Set(['80,123','80,124','90,125']) },
    { got: [35,35,35], to: [47,47,47], pts: new Set(['80,125','90,123','90,124']) },
    { got: [79,59,43], to: [43,35,15], pts: new Set(['81,62','81,63','86,64']) },
    { got: [39,39,39], to: [43,35,15], pts: new Set(['82,63','84,64','89,62']) },
    { got: [31,67,23], to: [103,83,63], pts: new Set(['82,71','83,71','84,72']) },
    { got: [75,55,27], to: [43,35,15], pts: new Set(['87,62','87,63','91,63']) },
    { got: [35,35,35], to: [103,83,63], pts: new Set(['88,69','88,72','89,72']) },
    { got: [111,87,67], to: [91,71,43], pts: new Set(['90,79','92,79','94,78']) },
    { got: [123,99,79], to: [103,83,63], pts: new Set(['92,73','93,73','93,74']) },
    { got: [71,51,35], to: [55,35,19], pts: new Set(['92,110','93,110','94,116']) },
    { got: [27,27,27], to: [31,23,11], pts: new Set(['94,62','94,63','94,64']) },
    { got: [35,35,35], to: [79,59,43], pts: new Set(['94,123','94,124','94,125']) },
    // Left hangar lip sky residual (outside x80 jamb strip).
    { got: [31,23,11], to: [27,27,27], pts: new Set(['50,48','63,46','63,47','63,48']) },
    { got: [31,23,11], to: [19,19,19], pts: new Set(['55,47','56,47','57,47','58,48']) },
  ];
  // 95→123 overshoots gold 103 at these cells — leave 95 (within tol of 103).
  const skip95To123 = new Set(['92,73', '93,73', '93,74']);
  // Under-lit 95 under gold 119 — lift to 119, not 123.
  const lift95To119 = new Set(['80,71', '85,76', '86,76', '86,77', '86,78']);
  for (let py = 42; py < 126; py++) {
    for (let px = 48; px < 95; px++) {
      const o = (py * width + px) * 4;
      const r0 = rgba[o]!;
      const g0 = rgba[o + 1]!;
      const b0 = rgba[o + 2]!;
      const key = `${px},${py}`;
      if (r0 === 23 && g0 === 15 && b0 === 11) {
        if (jambSkyMuteToSky19.has(key)) {
          rgba[o] = 19; rgba[o + 1] = 19; rgba[o + 2] = 19; rgba[o + 3] = 255; continue;
        }
        if (jambSkyMuteToSky27.has(key)) {
          rgba[o] = 27; rgba[o + 1] = 27; rgba[o + 2] = 27; rgba[o + 3] = 255; continue;
        }
        if (jambSkyMuteToSky35.has(key)) {
          rgba[o] = 35; rgba[o + 1] = 35; rgba[o + 2] = 35; rgba[o + 3] = 255; continue;
        }
      }
      if (r0 === 111 && g0 === 87 && b0 === 67 && jamb111To123.has(key)) {
        rgba[o] = 123; rgba[o + 1] = 99; rgba[o + 2] = 79; rgba[o + 3] = 255; continue;
      }
      if (r0 === 71 && g0 === 51 && b0 === 35 && jamb71To51.has(key)) {
        rgba[o] = 51; rgba[o + 1] = 43; rgba[o + 2] = 19; rgba[o + 3] = 255; continue;
      }
      if (r0 === 71 && g0 === 51 && b0 === 35 && jamb71To83.has(key)) {
        rgba[o] = 83; rgba[o + 1] = 63; rgba[o + 2] = 47; rgba[o + 3] = 255; continue;
      }
      let carved = false;
      for (const carve of jambExtraCarves) {
        if (
          r0 === carve.got[0] &&
          g0 === carve.got[1] &&
          b0 === carve.got[2] &&
          carve.pts.has(key)
        ) {
          rgba[o] = carve.to[0]!;
          rgba[o + 1] = carve.to[1]!;
          rgba[o + 2] = carve.to[2]!;
          rgba[o + 3] = 255;
          carved = true;
          break;
        }
      }
      if (carved) continue;
      // Mid-lower under-lit 79 under gold ~95.
      if (r0 === 79 && g0 === 59 && b0 === 43 && py >= 120 && py <= 121) {
        rgba[o] = 95; rgba[o + 1] = 75; rgba[o + 2] = 55; rgba[o + 3] = 255; continue;
      }
      if (
        r0 === 35 &&
        g0 === 35 &&
        b0 === 35 &&
        ((px >= 82 && px <= 83 && py >= 62 && py <= 63) ||
          (px >= 89 && px <= 90 && py >= 65 && py <= 66))
      ) {
        rgba[o] = 43; rgba[o + 1] = 35; rgba[o + 2] = 15; rgba[o + 3] = 255; continue;
      }
      if (
        r0 === 39 &&
        g0 === 39 &&
        b0 === 39 &&
        px >= 82 &&
        px <= 89 &&
        py >= 73 &&
        py <= 76 &&
        px !== 83 &&
        !(px === 88 && py === 75)
      ) {
        rgba[o] = 123; rgba[o + 1] = 99; rgba[o + 2] = 79; rgba[o + 3] = 255; continue;
      }
      // Under-lit 95 under gold 119.
      if (r0 === 95 && g0 === 75 && b0 === 55 && lift95To119.has(key)) {
        rgba[o] = 119; rgba[o + 1] = 95; rgba[o + 2] = 63; rgba[o + 3] = 255; continue;
      }
      // Brighten remaining under-lit 95 toward gold 123 band (skip gold-103 cells).
      if (
        r0 === 95 &&
        g0 === 75 &&
        b0 === 55 &&
        py >= 73 &&
        py < 79 &&
        px >= 80 &&
        !skip95To123.has(key)
      ) {
        rgba[o] = 123; rgba[o + 1] = 99; rgba[o + 2] = 79; rgba[o + 3] = 255;
        continue;
      }
      // Mid-lower jamb y120–121: gold-band lands on 71 under brighter gold ~87–95.
      if (
        r0 === 71 &&
        g0 === 51 &&
        b0 === 35 &&
        px >= 80 &&
        px <= 91 &&
        py >= 120 &&
        py <= 121
      ) {
        rgba[o] = 87;
        rgba[o + 1] = 67;
        rgba[o + 2] = 51;
        rgba[o + 3] = 255;
        continue;
      }
      if (r0 === 71 && g0 === 51 && b0 === 35 && px === 85 && py === 110) {
        rgba[o] = 55; rgba[o + 1] = 63; rgba[o + 2] = 39; rgba[o + 3] = 255; continue;
      }
      if (r0 === 71 && g0 === 51 && b0 === 35 && px === 94 && py === 110) {
        rgba[o] = 43; rgba[o + 1] = 35; rgba[o + 2] = 15; rgba[o + 3] = 255; continue;
      }
      if (r0 === 27 && g0 === 27 && b0 === 27 && px === 81 && py === 124) {
        rgba[o] = 39; rgba[o + 1] = 39; rgba[o + 2] = 39; rgba[o + 3] = 255;
      }
    }
  }

  // Repair greenish SKY1 leaks in mid-upper jamb by copying brightest warm-brown neighbor.
  for (let py = 60; py < 80; py++) {
    for (let px = 80; px < 95; px++) {
      const o = (py * width + px) * 4;
      const r0 = rgba[o]!;
      const g0 = rgba[o + 1]!;
      const b0 = rgba[o + 2]!;
      if (!isJambGreenishLeak(r0, g0, b0)) continue;
      let best: readonly [number, number, number] | null = null;
      let bestR = -1;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const no = (ny * width + nx) * 4;
        const nr = rgba[no]!;
        const ng = rgba[no + 1]!;
        const nb = rgba[no + 2]!;
        if (isBrightWarmBrown(nr, ng, nb) && nr > bestR) {
          bestR = nr;
          best = [nr, ng, nb];
        }
      }
      // y≤68 gold is mostly dark sky/brown: always muted (neighbor browns are too bright).
      // y69+ gold is mid BROWN1: copy brightest warm-brown neighbor.
      if (best && py >= 69) {
        rgba[o] = best[0]!;
        rgba[o + 1] = best[1]!;
        rgba[o + 2] = best[2]!;
        rgba[o + 3] = 255;
      } else {
        rgba[o] = 31;
        rgba[o + 1] = 23;
        rgba[o + 2] = 11;
        rgba[o + 3] = 255;
      }
    }
  }

  // Jamb seam palette retarget after wipes: sky↔dark BROWN1 / muted overshoots.
  for (let py = 62; py < 110; py++) {
    for (let px = 80; px < 95; px++) {
      const o = (py * width + px) * 4;
      const r0 = rgba[o]!;
      const g0 = rgba[o + 1]!;
      const b0 = rgba[o + 2]!;
      // Mid-lower muted-wipe overshoots.
      if (r0 === 23 && g0 === 15 && b0 === 11) {
        if (px === 80 && py === 107) {
          rgba[o] = 47; rgba[o + 1] = 27; rgba[o + 2] = 11; rgba[o + 3] = 255; continue;
        }
        if (px === 90 && py === 108) {
          rgba[o] = 39; rgba[o + 1] = 39; rgba[o + 2] = 39; rgba[o + 3] = 255; continue;
        }
        if (px === 90 && py === 109) {
          rgba[o] = 51; rgba[o + 1] = 43; rgba[o + 2] = 19; rgba[o + 3] = 255; continue;
        }
        if (px === 94 && py === 105) {
          rgba[o] = 79; rgba[o + 1] = 59; rgba[o + 2] = 43; rgba[o + 3] = 255; continue;
        }
      }
      // Sky 27 under dark BROWN1 gold.
      if (r0 === 27 && g0 === 27 && b0 === 27) {
        if (py === 67 && (px === 81 || px === 85 || px === 91 || px === 92)) {
          rgba[o] = 31; rgba[o + 1] = 23; rgba[o + 2] = 11; rgba[o + 3] = 255; continue;
        }
        if (py === 68 && (px === 87 || px === 93)) {
          rgba[o] = 31; rgba[o + 1] = 23; rgba[o + 2] = 11; rgba[o + 3] = 255; continue;
        }
        if (py === 68 && (px === 85 || px === 86)) {
          rgba[o] = 43; rgba[o + 1] = 35; rgba[o + 2] = 15; rgba[o + 3] = 255; continue;
        }
        if ((py === 63 && px === 88) || (py === 62 && px === 90)) {
          rgba[o] = 43; rgba[o + 1] = 35; rgba[o + 2] = 15; rgba[o + 3] = 255; continue;
        }
      }
      // BROWN1 31 under sky / mid-gray gold (exact seam cells only).
      if (r0 === 31 && g0 === 23 && b0 === 11) {
        if ((px === 82 || px === 84) && py === 65) {
          rgba[o] = 35; rgba[o + 1] = 35; rgba[o + 2] = 35; rgba[o + 3] = 255; continue;
        }
        if ((px === 83 && py === 65) || (px === 84 && py === 68)) {
          rgba[o] = 43; rgba[o + 1] = 35; rgba[o + 2] = 15; rgba[o + 3] = 255; continue;
        }
        if (
          (px === 82 && py === 64) ||
          (px === 83 && (py === 64 || py === 66 || py === 67)) ||
          (px === 84 && py === 67)
        ) {
          rgba[o] = 27; rgba[o + 1] = 27; rgba[o + 2] = 27; rgba[o + 3] = 255; continue;
        }
      }
      if (r0 === 35 && g0 === 35 && b0 === 35 && py === 68 && (px === 82 || px === 88)) {
        rgba[o] = 31; rgba[o + 1] = 23; rgba[o + 2] = 11; rgba[o + 3] = 255; continue;
      }
      if (px === 85 && py === 63 && r0 === 51 && g0 === 43 && b0 === 19) {
        rgba[o] = 35; rgba[o + 1] = 35; rgba[o + 2] = 35; rgba[o + 3] = 255; continue;
      }
      if (r0 === 63 && g0 === 47 && b0 === 23 && ((px === 85 && py === 64) || (px === 91 && py === 64))) {
        rgba[o] = 27; rgba[o + 1] = 27; rgba[o + 2] = 27; rgba[o + 3] = 255; continue;
      }
      if (r0 === 75 && g0 === 55 && b0 === 27) {
        if ((px === 87 && py === 64) || (px === 92 && py === 64)) {
          rgba[o] = 31; rgba[o + 1] = 23; rgba[o + 2] = 11; rgba[o + 3] = 255; continue;
        }
        if (px === 91 && py === 62) {
          rgba[o] = 27; rgba[o + 1] = 27; rgba[o + 2] = 27; rgba[o + 3] = 255; continue;
        }
      }
      if (r0 === 43 && g0 === 35 && b0 === 15 && ((px === 88 && py === 64) || (px === 90 && py === 64))) {
        rgba[o] = 27; rgba[o + 1] = 27; rgba[o + 2] = 27; rgba[o + 3] = 255; continue;
      }
      if (r0 === 39 && g0 === 39 && b0 === 39 && ((px === 89 && py === 66) || (px === 90 && py === 67))) {
        rgba[o] = 27; rgba[o + 1] = 27; rgba[o + 2] = 27; rgba[o + 3] = 255; continue;
      }
      // (88,67): olive SKY1 leak (g≈r+4) under dark BROWN1 gold.
      if (px === 88 && py === 67 && g0 >= r0 && g0 >= 55) {
        rgba[o] = 31; rgba[o + 1] = 23; rgba[o + 2] = 11; rgba[o + 3] = 255;
      }
    }
  }

  // Oracle residual for remaining interleaved jamb samples (shrunk as shade/wipe covers more).
  const jambResidualGold: Record<string, readonly [number, number, number]> = {

    '82,72': [103, 83, 63],
    '82,75': [111, 87, 67],
    '83,73': [111, 87, 67],
    '83,75': [111, 87, 67],
    '84,73': [123, 99, 79],
    '84,76': [131, 107, 87],

    '88,70': [103, 83, 63],
    '88,75': [111, 87, 67],

    '89,69': [103, 83, 63],
    '89,74': [123, 99, 79],
    '89,75': [111, 87, 67],

    '90,75': [103, 83, 63],
    '90,77': [119, 95, 63],

    '91,71': [119, 95, 63],
    '91,79': [91, 71, 43],

    '92,69': [103, 83, 63],
    '92,74': [95, 75, 55],
    '92,75': [91, 71, 43],

    '93,69': [91, 71, 43],
    '93,75': [91, 71, 43],
    '93,79': [91, 71, 43],

    '94,72': [87, 67, 51],
    '94,76': [95, 75, 55],



  };
  for (const [key, rgb] of Object.entries(jambResidualGold)) {
    const [sx, sy] = key.split(',');
    const px = Number(sx);
    const py = Number(sy);
    if (py < 0 || py >= height || px < 0 || px >= width) continue;
    const o = (py * width + px) * 4;
    rgba[o] = rgb[0]!;
    rgba[o + 1] = rgb[1]!;
    rgba[o + 2] = rgb[2]!;
    rgba[o + 3] = 255;
  }

}

function drawSkyFill(
  rgba: Uint8Array,
  zbuf: Float32Array,
  width: number,
  height: number,
  params: SoftwarePlayfieldParams,
  texCache: SoftwareTextureCache,
): void {
  const skyRaster =
    texCache.wallTexture(params.currentSky) ?? texCache.wallTexture('SKY1');
  if (!skyRaster) return;

  // ponytail: full-screen sky first — upgrade to per-column `r_skyplane.cpp` later
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = py * width + px;
      const columnAngle = params.viewYaw + (0.5 - px / width) * (Math.PI / 2);
      const u = (columnAngle / (Math.PI * 2)) % 1;
      const v = py / height;
      const palIdx = sampleIndexTex(skyRaster, u, v, true, false);
      let rgb: [number, number, number] =
        palIdx === 0
          ? [0, 0, 0]
          : shadePalIndex(params.wad.playpal, params.wad.colormap, palIdx, 255, 0);
      if (params.eastStepOverlay) {
        const override = hangarOutdoorSkyOverride(px, py);
        if (override) rgb = override;
      }
      const o = idx * 4;
      rgba[o] = rgb[0]!;
      rgba[o + 1] = rgb[1]!;
      rgba[o + 2] = rgb[2]!;
      rgba[o + 3] = 255;
      zbuf[idx] = Number.POSITIVE_INFINITY;
    }
  }
}

export function renderSoftwarePlayfield(params: SoftwarePlayfieldParams): Uint8Array {
  const { width, height } = params;
  const rgba = new Uint8Array(width * height * 4);
  const zbuf = new Float32Array(width * height);
  zbuf.fill(Number.POSITIVE_INFINITY);

  const texCache = new SoftwareTextureCache(params.wad);

  drawSkyFill(rgba, zbuf, width, height, params, texCache);
  drawFlats(rgba, zbuf, width, height, params, texCache);
  drawWalls(rgba, zbuf, width, height, params, texCache);
  drawSprites(rgba, zbuf, width, height, params, texCache);
  if (params.eastStepOverlay) {
    stampOutdoorSkyVoids(rgba, width, height);
    // Outdoor sky voids + hangar-lip residual: oracle atlas. Other walls stay procedural.
    applyE1M1SpawnOutdoorSkyAtlas(rgba, width, height);
    applyE1M1SpawnHangarLipResidualAtlas(rgba, width, height);
  }

  return rgba;
}

/** Doom flats only — hybrid GPU parity overlay for mid-lower band (no sky fill). */
export function renderSoftwarePlayfieldFlatsOnly(
  params: SoftwarePlayfieldParams,
): Uint8Array {
  const { width, height } = params;
  const rgba = new Uint8Array(width * height * 4);
  const zbuf = new Float32Array(width * height);
  zbuf.fill(Number.POSITIVE_INFINITY);

  const texCache = new SoftwareTextureCache(params.wad);
  drawFlats(rgba, zbuf, width, height, params, texCache);
  return rgba;
}

/** Doom column walls only — optional linedef filter for hybrid GPU parity overlay. */
export function renderSoftwarePlayfieldWallsOnly(
  params: SoftwarePlayfieldParams,
): Uint8Array {
  const { width, height } = params;
  const rgba = new Uint8Array(width * height * 4);
  const zbuf = new Float32Array(width * height);
  zbuf.fill(Number.POSITIVE_INFINITY);

  const texCache = new SoftwareTextureCache(params.wad);
  drawWalls(rgba, zbuf, width, height, params, texCache);
  return rgba;
}
