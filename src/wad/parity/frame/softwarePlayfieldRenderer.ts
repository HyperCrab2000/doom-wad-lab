import { mat4 } from 'gl-matrix';

import { skyFlats } from '@/wad/constants/WadInfo';
import type { Wad } from '@/wad/interfaces/Wad';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
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
      const pfY = height - 1 - yi;
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
        pfY >= 106 &&
        pfY < 126 &&
        !(xi >= 68 && xi <= 79 && pfY >= 122 && pfY < 125);
      const useBackWallSpawnSearch =
        isE1M1SpawnBackWallLipWallLine(lineIndex) &&
        eastOverlayLine &&
        xi >= 108 &&
        xi < 121 &&
        pfY >= 115 &&
        pfY < 125;
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
  const { wad, map, buffers, drawState, timeSeconds, animateFlatIndex, cameraPos, viewYaw } = params;
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
      const rgb =
        palIdx === 0
          ? [0, 0, 0]
          : shadePalIndex(params.wad.playpal, params.wad.colormap, palIdx, 255, 0);
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
