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
import { buildInvViewProj } from '@/wad/renderer/rtgl/pathTraceCpu';
import {
  computeGzdoomParityViewLayout,
  VANILLA_3D_HEIGHT,
  VANILLA_SCREEN_WIDTH,
} from '@/wad/renderer/renderGame/gameViewLayout';
import { doomVerticalFovDegrees } from '@/wad/parity/frame/frameParity';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { FROZEN_GOLD_PARITY_PITCH } from '@/wad/parity/frame/frameParity';
import { getPlayerEyeZ } from '@/wad/renderer/controls/playerView';
import { renderSoftwarePlayfieldWallsOnly } from '@/wad/parity/frame/softwarePlayfieldRenderer';
import { wallShadeOffsetBands } from '@/wad/parity/frame/gzdoomColormap';

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
const geometry = buildMapGeometryCpu(map, buildTextureLookup(map, wad));
const bspRenderIndex = buildBspRenderIndex(map)!;
const subsectorFlatObjects = mapToSubsectorFlats(map, bspRenderIndex);
const sectorVisibility = buildSectorVisibilityIndex(map)!;
const buffers = {
  bspRenderIndex,
  sectorTriangles: geometry.sectorTriangles,
  triangleHash: geometry.triangleHash,
  sectorVisibility,
  walls: pathTraceWallSlicesFromWallObjects(geometry.walls),
  flats: pathTraceFlatSlicesFromFlatObjects(geometry.flats),
  subsectorFlats: pathTraceFlatSlicesFromFlatObjects(subsectorFlatObjects),
  wallRangesByLine: buildWallRangesByLine(geometry.walls, map.LINEDEFS.length),
  wallRangesByLineAndSide: buildWallRangesByLineAndSide(
    geometry.walls.map((wall) => ({
      lineIndex: wall.lineIndex ?? -1,
      sideDefIndex: wall.sideDefIndex ?? -1,
    })),
    map.LINEDEFS.length,
    map,
  ),
} as never;
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
const layout = computeGzdoomParityViewLayout(640, 480);
const projectionMatrix = mat4.create();
mat4.perspective(
  projectionMatrix,
  (doomVerticalFovDegrees(layout.width, layout.height) / 180) * Math.PI,
  layout.width / layout.height,
  0.1,
  64000,
);
const modelMatrix = mat4.create();
const modelViewMatrix = mat4.create();
mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
const modelViewProjMatrix = mat4.create();
mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);
const invViewProjMatrix = buildInvViewProj(modelViewProjMatrix);
const drawState = buildGzdoomDrawState({
  map,
  buffers,
  viewX: player.x,
  viewY: player.y,
  viewYaw,
  cameraPos,
})!;
const rgba = renderSoftwarePlayfieldWallsOnly({
  width: VANILLA_SCREEN_WIDTH,
  height: VANILLA_3D_HEIGHT,
  wad,
  map,
  buffers,
  drawState,
  invViewProjMatrix,
  modelViewProjMatrix,
  cameraPos,
  wallTexturesByName: buildTextureLookup(map, wad),
  animateFlatIndex: 0,
  animateWallIndex: 0,
  timeSeconds: 0,
  currentSky: sector.ceilingpic,
  viewYaw,
  viewPitch: FROZEN_GOLD_PARITY_PITCH,
  visibleSectors: drawState.visibleSectors,
  wallLineFilter: (n) => n === 53,
  eastStepOverlay: true,
});
function px(x: number, y: number) {
  const o = (y * VANILLA_SCREEN_WIDTH + x) * 4;
  return `${rgba[o]},${rgba[o + 1]},${rgba[o + 2]}`;
}
for (const [x, y] of [
  [58, 52],
  [59, 52],
  [60, 52],
  [61, 52],
  [62, 52],
  [63, 55],
  [64, 55],
  [65, 55],
  [252, 44],
]) {
  const pfY = VANILLA_3D_HEIGHT - 1 - y;
  console.log(`(${x},${y}) bands=${wallShadeOffsetBands(x, pfY, true).toFixed(2)} ${px(x, y)}`);
}
