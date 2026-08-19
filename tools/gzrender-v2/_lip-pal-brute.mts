#!/usr/bin/env tsx
/** Find per-pal extra band offset for gold 31,23,11 on spawn hangar lip. */
import fs from 'node:fs';
import path from 'node:path';
import { mat4, vec3 } from 'gl-matrix';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { hwWallProcessSide } from '@/wad/renderer/bsp/hwWallProcess';
import {
  getViewAnglesFromViewMatrix,
  getPlayerEyeZ,
  writePlayerViewMatrix,
  type PlayerViewState,
} from '@/wad/renderer/controls/playerView';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '@/wad/renderer/geometry/geometryCache';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import {
  gzdoomPitchCenteryOffset,
  gzdoomScreenZ,
  gzdoomViewport,
  gzdoomWallScreenX,
  gzdoomWallScreenY,
} from '@/wad/parity/frame/gzdoomScreenZ';
import { FROZEN_GOLD_PARITY_PITCH } from '@/wad/parity/frame/frameParity';
import { globVisFromPlayfield } from '@/wad/parity/frame/gzdoomGlobVis';
import { shadePalIndex, wallShadeOffsetBands, wallVisibility } from '@/wad/parity/frame/gzdoomColormap';
import { colormapSectorLightLevel } from '@/wad/renderer/renderGame/sectorDynamicLight';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { sampleIndexTex, SoftwareTextureCache } from '@/wad/parity/frame/softwareTextureCache';
import { VANILLA_3D_HEIGHT, VANILLA_SCREEN_WIDTH } from '@/wad/renderer/renderGame/gameViewLayout';

function buildTextureLookup(map: ReturnType<typeof loadE1M1>['map'], wad: ReturnType<typeof loadE1M1>['wad']) {
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }
  const texturesByName: Record<string, WallTexture> = {};
  for (const name of texNames) {
    const lump = wad.textures[name];
    texturesByName[name] = { name, width: lump?.width ?? 64, height: lump?.height ?? 128, transparent: false, graphics: {} as never };
  }
  return texturesByName;
}

function loadE1M1() {
  const buf = fs.readFileSync(path.resolve('public/wads/DOOM.WAD'));
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { wad, map: wad.maps.E1M1 };
}

const gold: [number, number, number] = [31, 23, 11];
function distRgb(a: readonly number[], b: readonly number[]) {
  return Math.max(Math.abs(a[0]! - b[0]!), Math.abs(a[1]! - b[1]!), Math.abs(a[2]! - b[2]!));
}

function findExtra(palIdx: number, light: number, vis: number, base: number): number {
  let best = 0;
  let bestD = 999;
  for (let extra = -3; extra <= 4.001; extra += 0.025) {
    const rgb = shadePalIndex(wad.playpal, wad.colormap, palIdx, light, vis, base + extra);
    const d = distRgb(rgb, gold);
    if (d < bestD) {
      bestD = d;
      best = extra;
    }
  }
  return best;
}

const { wad, map } = loadE1M1();
const player = map.THINGS.find((t) => t.type === 1)!;
const sector = map.SECTORS[29]!;
const viewState: PlayerViewState = {
  x: player.x,
  y: player.y,
  yaw: (player.angle * Math.PI) / 180,
  pitch: FROZEN_GOLD_PARITY_PITCH,
  worldFeetZ: sector.floorheight,
  sector,
};
const viewMatrix = mat4.create();
writePlayerViewMatrix(viewMatrix, viewState);
const viewYaw = getViewAnglesFromViewMatrix(viewMatrix).yaw;
const cameraPos = vec3.fromValues(player.x, getPlayerEyeZ(sector, viewState.worldFeetZ), -player.y) as [number, number, number];
const width = VANILLA_SCREEN_WIDTH;
const height = VANILLA_3D_HEIGHT;
const texCache = new SoftwareTextureCache(wad);
const wallTexturesByName = buildTextureLookup(map, wad);
const geometry = buildMapGeometryCpu(map, wallTexturesByName);
const bspRenderIndex = buildBspRenderIndex(map)!;
const sectorVisibility = buildSectorVisibilityIndex(map)!;
const buffers = {
  bspRenderIndex,
  sectorTriangles: geometry.sectorTriangles,
  triangleHash: geometry.triangleHash,
  sectorVisibility,
  walls: pathTraceWallSlicesFromWallObjects(geometry.walls),
} as never;
const drawState = buildGzdoomDrawState({ map, buffers, viewX: player.x, viewY: player.y, viewYaw, cameraPos })!;
const entry = drawState.wallDrawOrder.find((e) => e.lineIndex === 53)!;
const seg = map.SEGS[entry.segIndex]!;
const line = map.LINEDEFS[53]!;
const v1 = map.VERTEXES[seg.v1]!;
const v2 = map.VERTEXES[seg.v2]!;
const side = map.SIDEDEFS[entry.sideDefIndex]!;
const otherSide = line.sidenum[0] === entry.sideDefIndex ? line.sidenum[1] : line.sidenum[0];
const band = hwWallProcessSide({ map, lineDef: line, sideDefIndex: entry.sideDefIndex, otherSideDefIndex: otherSide, texturesByName: wallTexturesByName }).find((b) => b.texName === 'STARTAN3')!;
const raster = texCache.wallTexture('STARTAN3')!;
const texW = 64;
const texH = 128;
const uvHeight = Math.min((band.top - band.bottom) / texH, 1);
let offsetY = side.yOffset / texH;
if (!band.drawFromTop) offsetY += 1 - uvHeight - (band.bottomStart ?? 0);
const vp = gzdoomViewport(width, height, viewYaw);
const eye = cameraPos[1]!;
const sx1 = gzdoomWallScreenX(v1.x, v1.y, player.x, player.y, vp)!;
const sx2 = gzdoomWallScreenX(v2.x, v2.y, player.x, player.y, vp)!;
const invZ1 = 1 / Math.max(gzdoomScreenZ(v1.x, v1.y, player.x, player.y, viewYaw), 1);
const invZ2 = 1 / Math.max(gzdoomScreenZ(v2.x, v2.y, player.x, player.y, viewYaw), 1);
const xSpan = sx2 - sx1 || 1;
const pitchY = gzdoomPitchCenteryOffset(vp, FROZEN_GOLD_PARITY_PITCH);
const { wallGlobVis } = globVisFromPlayfield(width, height, width, height);
const light = colormapSectorLightLevel(sector);

const palMap = new Map<number, number[]>();
for (const [xi, yi] of [[58, 52], [59, 52], [60, 52], [61, 52], [62, 52], [63, 55], [64, 55], [65, 55]] as const) {
  const t = (xi + 0.5 - sx1) / xSpan;
  const sz = 1 / (invZ1 * (1 - t) + invZ2 * t);
  const worldH = eye + ((vp.centerY - yi - pitchY) * sz) / vp.invZtoScale;
  const vWorld = (worldH - band.bottom + side.yOffset) / texH;
  const uCoord = (seg.offset + t * Math.hypot(v2.x - v1.x, v2.y - v1.y) + side.xOffset) / texW;
  const palIdx = sampleIndexTex(raster, uCoord, vWorld, true, band.repeatVertical);
  const pfY = height - 1 - yi;
  const base = wallShadeOffsetBands(xi, pfY, true);
  const vis = wallVisibility(sz, wallGlobVis);
  const extra = findExtra(palIdx, light, vis, base);
  const rgb = shadePalIndex(wad.playpal, wad.colormap, palIdx, light, vis, base + extra);
  console.log(`(${xi},${yi}) pal=${palIdx} vis=${vis.toFixed(4)} base=${base.toFixed(2)} extra=${extra.toFixed(2)} rgb=${rgb.join(',')} d=${distRgb(rgb, gold)}`);
  const arr = palMap.get(palIdx) ?? [];
  arr.push(extra);
  palMap.set(palIdx, arr);
}
console.log('pal averages:', [...palMap.entries()].map(([p, xs]) => `${p}:${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)}`).join(' '));
