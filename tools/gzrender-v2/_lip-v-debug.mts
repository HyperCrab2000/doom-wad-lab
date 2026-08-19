#!/usr/bin/env tsx
/** Debug line 53 u/v/palIdx at lip rows — worldH vs vFrac. */
import fs from 'node:fs';
import path from 'node:path';
import { mat4, vec3 } from 'gl-matrix';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import {
  getViewAnglesFromViewMatrix,
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
import { hwWallProcessSide } from '@/wad/renderer/bsp/hwWallProcess';
import {
  gzdoomPitchCenteryOffset,
  gzdoomScreenZ,
  gzdoomViewport,
  gzdoomWallScreenX,
  gzdoomWallScreenY,
} from '@/wad/parity/frame/gzdoomScreenZ';
import { FROZEN_GOLD_PARITY_PITCH } from '@/wad/parity/frame/frameParity';
import { getPlayerEyeZ } from '@/wad/renderer/controls/playerView';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { sampleIndexTex, SoftwareTextureCache } from '@/wad/parity/frame/softwareTextureCache';
import { shadePalIndexWall, wallShadeOffsetBands } from '@/wad/parity/frame/gzdoomColormap';
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
    texturesByName[name] = {
      name,
      width: lump?.width ?? 64,
      height: lump?.height ?? 128,
      transparent: false,
      graphics: {} as never,
    };
  }
  return texturesByName;
}

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { wad, map: wad.maps.E1M1 };
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
const cameraPos = vec3.fromValues(
  player.x,
  getPlayerEyeZ(sector, viewState.worldFeetZ),
  -player.y,
) as [number, number, number];
const viewX = player.x;
const viewY = player.y;
const viewPitch = FROZEN_GOLD_PARITY_PITCH;
const width = VANILLA_SCREEN_WIDTH;
const height = VANILLA_3D_HEIGHT;
const texCache = new SoftwareTextureCache(wad);
const wallTexturesByName = buildTextureLookup(map, wad);

const geometry = buildMapGeometryCpu(map, wallTexturesByName);
const bspRenderIndex = buildBspRenderIndex(map)!;
const buffers = {
  bspRenderIndex,
  sectorTriangles: geometry.sectorTriangles,
  triangleHash: geometry.triangleHash,
  walls: pathTraceWallSlicesFromWallObjects(geometry.walls),
} as never;

const drawState = buildGzdoomDrawState({
  map,
  buffers,
  viewX,
  viewY,
  viewYaw,
  cameraPos,
})!;

const entry = drawState.wallDrawOrder.find((e) => e.lineIndex === 53)!;
const seg = map.SEGS[entry.segIndex]!;
const line = map.LINEDEFS[53]!;
const v1 = map.VERTEXES[seg.v1]!;
const v2 = map.VERTEXES[seg.v2]!;
const side = map.SIDEDEFS[entry.sideDefIndex]!;
const otherSide = line.sidenum[0] === entry.sideDefIndex ? line.sidenum[1] : line.sidenum[0];
const bands = hwWallProcessSide({
  map,
  lineDef: line,
  sideDefIndex: entry.sideDefIndex,
  otherSideDefIndex: otherSide,
  texturesByName: wallTexturesByName,
});
const band = bands.find((b) => b.texName === 'STARTAN3') ?? bands[0]!;
const raster = texCache.wallTexture('STARTAN3')!;
const texW = 64;
const texH = 128;
const physicalHeight = (band.top - band.bottom) / texH;
const uvHeight = band.repeatVertical ? physicalHeight : Math.min(physicalHeight, 1);
let offsetY = side.yOffset / texH;
if (!band.drawFromTop) offsetY += 1 - uvHeight - (band.bottomStart ?? 0);

const vp = gzdoomViewport(width, height, viewYaw);
const eye = cameraPos[1]!;
const sx1 = gzdoomWallScreenX(v1.x, v1.y, viewX, viewY, vp)!;
const sx2 = gzdoomWallScreenX(v2.x, v2.y, viewX, viewY, vp)!;
const segLen = Math.hypot(v2.x - v1.x, v2.y - v1.y) || 1;
const invZ1 = 1 / Math.max(gzdoomScreenZ(v1.x, v1.y, viewX, viewY, viewYaw), 1);
const invZ2 = 1 / Math.max(gzdoomScreenZ(v2.x, v2.y, viewX, viewY, viewYaw), 1);
const xSpan = sx2 - sx1 || 1;
const pitchY = gzdoomPitchCenteryOffset(vp, viewPitch);

console.log('band', { bottom: band.bottom, top: band.top, offsetY, uvHeight, sideYOffset: side.yOffset });

for (const [xi, yi] of [[58, 52], [59, 52], [60, 52], [61, 52], [62, 52], [64, 55]] as const) {
  const t = (xi + 0.5 - sx1) / xSpan;
  const sz = 1 / (invZ1 * (1 - t) + invZ2 * t);
  const yBottomRaw = gzdoomWallScreenY(band.bottom, eye, sz, vp);
  const yTopRaw = gzdoomWallScreenY(band.top, eye, sz, vp);
  const yBottom = yBottomRaw + pitchY;
  const yTop = yTopRaw + pitchY;
  const wallTop = Math.min(yTop, yBottom);
  const wallBot = Math.max(yTop, yBottom);
  const wallSpan = wallBot - wallTop || 1;
  const uCoord = (seg.offset + t * segLen + side.xOffset) / texW;
  const vFrac = yi <= wallTop ? 0 : yi >= wallBot ? 1 : (yi - wallTop) / wallSpan;
  const vScreen = offsetY + uvHeight * vFrac;
  const worldH = eye + ((vp.centerY - yi - pitchY) * sz) / vp.invZtoScale;
  const vWorld = (worldH - band.bottom + side.yOffset) / texH;
  const palScreen = sampleIndexTex(raster, uCoord, vScreen, true, band.repeatVertical);
  const palWorld = sampleIndexTex(raster, uCoord, vWorld, true, band.repeatVertical);
  const pfY = height - 1 - yi;
  const rgbWorld = shadePalIndexWall(wad.playpal, wad.colormap, palWorld, sector.lightlevel, 0.045, xi, pfY, true);
  const rgbScreen = shadePalIndexWall(wad.playpal, wad.colormap, palScreen, sector.lightlevel, 0.045, xi, pfY, true);
  console.log(
    `(${xi},${yi}) u=${uCoord.toFixed(3)} vWorld=${vWorld.toFixed(3)} pal=${palWorld} rgb=${rgbWorld.join(',')} | vScr=${vScreen.toFixed(3)} pal=${palScreen} rgb=${rgbScreen.join(',')} bands=${wallShadeOffsetBands(xi, pfY, true).toFixed(2)}`,
  );
}
