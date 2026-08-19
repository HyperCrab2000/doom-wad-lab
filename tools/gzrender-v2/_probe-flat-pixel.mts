#!/usr/bin/env tsx
import fs from 'node:fs';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { getPlayerEyeZ } from '@/wad/renderer/controls/playerView';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import { buildWallRangesByLineAndSide } from '@/wad/renderer/geometry/geometryCache';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import type { FlatBuffer } from '@/wad/interfaces/FlatBuffer';
import type { FlatObject } from '@/wad/interfaces/FlatObject';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { FROZEN_GOLD_PARITY_PITCH } from '@/wad/parity/frame/frameParity';
import { renderSoftwarePlayfieldFlatsOnly } from '@/wad/parity/frame/softwarePlayfieldRenderer';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { mat4 } from 'gl-matrix';
import { buildInvViewProj } from '@/wad/renderer/rtgl/pathTraceCpu';
import { doomVerticalFovDegrees } from '@/wad/parity/frame/frameParity';

import { gzdoomPitchCenteryOffset, gzdoomViewport } from '@/wad/parity/frame/gzdoomScreenZ';

const wad = loadWadFromArrayBuffer(fs.readFileSync('public/wads/DOOM.WAD').buffer);
const map = wad.maps.E1M1!;
const player = map.THINGS.find((t) => t.type === 1)!;
const sector = map.SECTORS[29]!;
const geometry = buildMapGeometryCpu(map, {});
const bspRenderIndex = buildBspRenderIndex(map)!;
const sectorVisibility = buildSectorVisibilityIndex(map)!;
const subsectorFlatObjects = mapToSubsectorFlats(map, bspRenderIndex);
const stub = {} as FlatBuffer['position'];
const subsectorFlats: FlatBuffer[] = subsectorFlatObjects.map((flat) => ({
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
const buffers = {
  bspRenderIndex,
  sectorVisibility,
  walls: geometry.walls,
  subsectorFlats,
  flats: geometry.flats,
  sectorTriangles: geometry.sectorTriangles,
  triangleHash: geometry.triangleHash,
  wallRangesByLine: [],
  wallRangesByLineAndSide: buildWallRangesByLineAndSide(
    geometry.walls.map((w) => ({ lineIndex: w.lineIndex ?? -1, sideDefIndex: w.sideDefIndex ?? -1 })),
    map.LINEDEFS.length,
    map,
  ),
} as never;

const yaw = (player.angle * Math.PI) / 180;
const cameraPos = [player.x, getPlayerEyeZ(sector, sector.floorheight), -player.y] as [number, number, number];
const drawState = buildGzdoomDrawState({ map, buffers, viewX: player.x, viewY: player.y, viewYaw: yaw, cameraPos })!;
const modelViewProjMatrix = mat4.create();
const invViewProjMatrix = mat4.create();
buildInvViewProj(modelViewProjMatrix, invViewProjMatrix, {
  cameraPos,
  yaw,
  pitch: FROZEN_GOLD_PARITY_PITCH,
  fovY: doomVerticalFovDegrees(),
  aspect: 320 / 168,
  near: 0.1,
  far: 32768,
});

const vp = gzdoomViewport(320, 168, yaw);
console.log('pitchY', gzdoomPitchCenteryOffset(vp, FROZEN_GOLD_PARITY_PITCH));

function sampleFlats(viewPitch: number) {
  const rgba = renderSoftwarePlayfieldFlatsOnly({
    width: 320,
    height: 168,
    wad,
    map,
    buffers,
    drawState,
    invViewProjMatrix,
    modelViewProjMatrix,
    cameraPos,
    wallTexturesByName: {},
    animateFlatIndex: 0,
    animateWallIndex: 0,
    timeSeconds: 0,
    viewYaw: yaw,
    viewPitch,
    eastStepOverlay: true,
    visibleSectors: drawState.visibleSectors,
  });
  let covered = 0;
  for (let y = 84; y < 126; y++) {
    for (let x = 0; x < 320; x++) {
      if (rgba[(y * 320 + x) * 4 + 3]! > 0) covered++;
    }
  }
  return { rgba, covered };
}

for (const pitch of [0, FROZEN_GOLD_PARITY_PITCH]) {
  const { rgba, covered } = sampleFlats(pitch);
  console.log('viewPitch', pitch, 'covered', covered);
  for (const [x, y] of [
    [160, 94],
    [80, 94],
    [240, 94],
  ]) {
    const i = (y * 320 + x) * 4;
    console.log(`  (${x},${y})=${rgba[i]},${rgba[i + 1]},${rgba[i + 2]} a=${rgba[i + 3]}`);
  }
}
