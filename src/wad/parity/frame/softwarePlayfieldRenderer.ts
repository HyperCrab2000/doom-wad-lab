import { mat4 } from 'gl-matrix';

import { skyFlats } from '@/wad/constants/WadInfo';
import type { Wad } from '@/wad/interfaces/Wad';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { buildFlatsBySubsector } from '@/wad/renderer/bsp/gzdoomDrawState';
import type { FlatBuffer } from '@/wad/interfaces/FlatBuffer';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import { hwWallProcessSide, type HwWallBand } from '@/wad/renderer/bsp/hwWallProcess';
import { getEffectiveSectorLightLevel } from '@/wad/renderer/renderGame/sectorDynamicLight';
import { normalizeFlatName } from '@/wad/renderer/renderGame/sectorLighting';
import type { RenderableThing } from '@/wad/renderer/renderGame/renderableThings';
import type { FramesByThingNameMap } from '@/wad/renderer/renderGame/types';
import {
  flatPlaneVisibility,
  shadePalIndex,
  wallVisibility,
} from '@/wad/parity/frame/gzdoomColormap';
import {
  doomViewCoordsFromCamera,
  gzdoomPlaneDepth,
  gzdoomScreenToDoom,
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
  renderableThings?: RenderableThing[];
  sortedFramesByThingName?: FramesByThingNameMap;
  animateSpriteIndex?: number;
  visibleSectors?: ReadonlySet<number> | null;
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
  const lightlevel = getEffectiveSectorLightLevel(band.sector, timeSeconds);
  const sz1 = gzdoomScreenZ(v1x, v1y, viewX, viewY, viewYaw);
  const sz2 = gzdoomScreenZ(v2x, v2y, viewX, viewY, viewYaw);
  const invZ1 = 1 / Math.max(sz1, 1);
  const invZ2 = 1 / Math.max(sz2, 1);
  const xSpan = sx2 - sx1 || 1;

  for (let xi = xStart; xi <= xEnd; xi++) {
    const t = (xi + 0.5 - sx1) / xSpan;
    const sz = 1 / (invZ1 * (1 - t) + invZ2 * t);
    const yBottom = gzdoomWallScreenY(band.bottom, eye, sz, vp);
    const yTop = gzdoomWallScreenY(band.top, eye, sz, vp);
    const y0 = Math.max(0, Math.ceil(Math.min(yTop, yBottom)));
    const y1 = Math.min(height - 1, Math.floor(Math.max(yTop, yBottom)));
    const colSpan = Math.abs(yBottom - yTop) || 1;
    const uCoord = (segOffset + t * segLen + sideXOffset) / texW;

    const vis = wallVisibility(sz);
    const depth = 1 / Math.max(sz, 1e-3);

    for (let yi = y0; yi <= y1; yi++) {
      const vFrac = Math.abs(yi - yTop) / colSpan;
      const v = offsetY + uvHeight * vFrac;
      const palIdx = sampleIndexTex(raster, uCoord, v, true, band.repeatVertical);
      if (palIdx === 0) continue;
      const rgb = shadePalIndex(wad.playpal, wad.colormap, palIdx, lightlevel, vis);
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
  } = params;
  const { viewX, viewY } = doomViewCoordsFromCamera(cameraPos);

  for (const entry of drawState.wallDrawOrder) {
    const seg = map.SEGS[entry.segIndex];
    const line = map.LINEDEFS[entry.lineIndex];
    if (!seg || !line) continue;

    const v1 = map.VERTEXES[seg.v1];
    const v2 = map.VERTEXES[seg.v2];
    if (!v1 || !v2) continue;
    if (!gzdoomSegFacesViewer(v1.x, v1.y, v2.x, v2.y, viewX, viewY)) continue;

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
    const planeVis = flatPlaneVisibility(planeH, py, centerY);
    for (let px = xStart; px <= xEnd; px++) {
      const { doomX, doomY } = gzdoomScreenToDoom(px, distance, viewX, viewY, vp);
      const sz = gzdoomScreenZ(doomX, doomY, viewX, viewY, viewYaw);
      const depth = 1 / Math.max(sz, 1e-3);
      const u = mod64(doomX) / 64;
      const v = mod64(doomY) / 64;
      const palIdx = sampleIndexTex(raster, u, v);
      if (palIdx === 0) continue;
      const rgb = shadePalIndex(wad.playpal, wad.colormap, palIdx, lightlevel, planeVis);
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
