import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from 'canvas';
import { mat4, vec3 } from 'gl-matrix';

import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import {
  getPlayerEyeZ,
  writePlayerViewMatrix,
  type PlayerViewState,
} from '@/wad/renderer/controls/playerView';
import { findSectorAt } from '@/wad/renderer/controls/doomPlayerControls';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '@/wad/renderer/geometry/geometryCache';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import type { FlatBuffer } from '@/wad/interfaces/FlatBuffer';
import type { FlatObject } from '@/wad/interfaces/FlatObject';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { buildInvViewProj } from '@/wad/renderer/rtgl/pathTraceCpu';
import { upscaleVanillaToGzdoomView } from '@/wad/parity/frame/frameDiff';
import {
  computeGzdoomParityViewLayout,
  VANILLA_3D_HEIGHT,
  VANILLA_SCREEN_WIDTH,
} from '@/wad/renderer/renderGame/gameViewLayout';
import { doomVerticalFovDegrees, FROZEN_GOLD_PARITY_PITCH } from '@/wad/parity/frame/frameParity';
import { renderSoftwarePlayfield } from '@/wad/parity/frame/softwarePlayfieldRenderer';
import { loadWadForMap, buildMapTextureLookup } from '../../../test/integration/helpers/wadFixtures.ts';
import { drawSpawnHudNode } from './drawSpawnHudNode.ts';

const FRAME_W = 640;
const FRAME_H = 480;

function cpuFlatBuffers(flats: FlatObject[]): FlatBuffer[] {
  const stub = {} as FlatBuffer['position'];
  return flats.map((flat) => ({
    position: stub,
    indices: stub as FlatBuffer['indices'],
    normal: stub,
    uv: stub,
    flatName: flat.flatName,
    sector: flat.sector,
    sectorIndex: flat.sectorIndex,
    subsectorIndex: flat.subsectorIndex,
    cpuPosition: flat.position,
    cpuUv: flat.uv,
    cpuIndices: flat.indices,
    center: flat.center,
    boundsRadius: flat.boundsRadius,
  }));
}

function buildMapBuffers(map: ReturnType<typeof loadWadForMap>['map'], wad: ReturnType<typeof loadWadForMap>['wad']): MapBuffers {
  const texturesByName = buildMapTextureLookup(map, wad);
  const geometry = buildMapGeometryCpu(map, texturesByName);
  const bspRenderIndex = buildBspRenderIndex(map)!;
  const sectorVisibility = buildSectorVisibilityIndex(map)!;
  const subsectorFlatObjects = mapToSubsectorFlats(map, bspRenderIndex);
  const walls = pathTraceWallSlicesFromWallObjects(geometry.walls);
  return {
    bspRenderIndex,
    sectorTriangles: geometry.sectorTriangles,
    triangleHash: geometry.triangleHash,
    sectorVisibility,
    walls,
    flats: pathTraceFlatSlicesFromFlatObjects(geometry.flats),
    subsectorFlats: cpuFlatBuffers(subsectorFlatObjects),
    wallRangesByLine: buildWallRangesByLine(geometry.walls, map.LINEDEFS.length),
    wallRangesByLineAndSide: buildWallRangesByLineAndSide(
      geometry.walls.map((wall) => ({
        lineIndex: wall.lineIndex ?? -1,
        sideDefIndex: wall.sideDefIndex ?? -1,
      })),
      map.LINEDEFS.length,
      map,
    ),
  } as MapBuffers;
}

function buildSpawnView(map: ReturnType<typeof loadWadForMap>['map'], buffers: MapBuffers, mapName: string) {
  const player = map.THINGS.find((t) => t.type === 1);
  if (!player) throw new Error(`No player 1 start on map`);
  const sector =
    mapName === 'E1M1'
      ? map.SECTORS[29]!
      : findSectorAt(map, buffers, { x: player.x, y: player.y });
  if (!sector) throw new Error('No sector at player start');
  const yaw = (player.angle * Math.PI) / 180;
  const viewState: PlayerViewState = {
    x: player.x,
    y: player.y,
    yaw,
    pitch: FROZEN_GOLD_PARITY_PITCH,
    worldFeetZ: sector.floorheight,
    sector,
  };
  const cameraPos = vec3.fromValues(
    player.x,
    getPlayerEyeZ(sector, viewState.worldFeetZ),
    -player.y,
  ) as [number, number, number];
  return { player, sector, yaw, viewState, cameraPos };
}

export interface SpawnOfflineCaptureResult {
  outPath: string;
  walls: number;
  flats: number;
  sectors: string;
}

/** CPU software spawn capture — procedural parity, no WebGL or gold oracle. */
export function captureClassicSpawnOffline(mapName: string, outPath: string): SpawnOfflineCaptureResult {
  const { wad, map } = loadWadForMap(mapName);
  const buffers = buildMapBuffers(map, wad);
  const { player, sector, yaw, viewState, cameraPos } = buildSpawnView(map, buffers, mapName);
  const drawState = buildGzdoomDrawState({
    map,
    buffers,
    viewX: player.x,
    viewY: player.y,
    viewYaw: yaw,
    cameraPos,
  });
  if (!drawState) throw new Error('buildGzdoomDrawState returned null');

  const layout = computeGzdoomParityViewLayout(FRAME_W, FRAME_H);
  const renderW = VANILLA_SCREEN_WIDTH;
  const renderH = VANILLA_3D_HEIGHT;
  const viewMatrix = mat4.create();
  const modelMatrix = mat4.create();
  writePlayerViewMatrix(viewMatrix, viewState);
  const projectionMatrix = mat4.create();
  mat4.perspective(
    projectionMatrix,
    (doomVerticalFovDegrees(layout.width, layout.height) / 180) * Math.PI,
    layout.width / layout.height,
    0.1,
    64000,
  );
  const modelViewMatrix = mat4.create();
  mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
  const modelViewProjMatrix = mat4.create();
  mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);
  const invViewProjMatrix = buildInvViewProj(modelViewProjMatrix);

  const rgba = renderSoftwarePlayfield({
    width: renderW,
    height: renderH,
    wad,
    map,
    buffers,
    drawState,
    invViewProjMatrix,
    modelViewProjMatrix,
    cameraPos,
    wallTexturesByName: buildMapTextureLookup(map, wad),
    animateFlatIndex: 0,
    animateWallIndex: 0,
    timeSeconds: 0,
    currentSky: sector.ceilingpic,
    viewYaw: yaw,
    viewPitch: FROZEN_GOLD_PARITY_PITCH,
    eastStepOverlay: mapName === 'E1M1',
    visibleSectors: drawState.visibleSectors,
  });

  const frame = createCanvas(FRAME_W, FRAME_H);
  const ctx = frame.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);

  const viewRgba = upscaleVanillaToGzdoomView(new Uint8ClampedArray(rgba), layout.width, layout.height);
  const pf = createCanvas(layout.width, layout.height);
  const pfCtx = pf.getContext('2d')!;
  const img = pfCtx.createImageData(layout.width, layout.height);
  img.data.set(viewRgba);
  pfCtx.putImageData(img, 0, 0);
  ctx.drawImage(pf, 0, 0);

  drawSpawnHudNode(ctx, wad, FRAME_W, FRAME_H);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, frame.toBuffer('image/png'));

  return {
    outPath,
    walls: drawState.wallDrawOrder.length,
    flats: drawState.flatSubsectorOrder.length,
    sectors: [...drawState.visibleSectors].join(','),
  };
}
