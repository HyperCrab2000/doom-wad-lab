#!/usr/bin/env tsx
import { installNodeCanvasDocument } from './lib/nodeCanvasDocument.ts';
installNodeCanvasDocument();

import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from 'canvas';
import { mat4, vec3 } from 'gl-matrix';

import { diffPlayfieldPngFiles } from '../../src/wad/parity/frame/frameDiff.ts';
import { doomVerticalFovDegrees } from '../../src/wad/parity/frame/frameParity.ts';
import { renderSoftwarePlayfield } from '../../src/wad/parity/frame/softwarePlayfieldRenderer.ts';
import { buildGzdoomDrawState } from '../../src/wad/renderer/bsp/gzdoomDrawState.ts';
import { buildBspRenderIndex } from '../../src/wad/renderer/bsp/bspRenderIndex.ts';
import { findSectorAt } from '../../src/wad/renderer/controls/doomPlayerControls.ts';
import { getPlayerEyeZ, writePlayerViewMatrix } from '../../src/wad/renderer/controls/playerView.ts';
import { buildMapGeometryCpu } from '../../src/wad/renderer/geometry/buildMapGeometryCpu.ts';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '../../src/wad/renderer/geometry/geometryCache.ts';
import { mapToSubsectorFlats } from '../../src/wad/renderer/geometry/mapToSubsectorFlats.ts';
import { buildInvViewProj } from '../../src/wad/renderer/rtgl/pathTraceCpu.ts';
import { computeGzdoomParityViewLayout } from '../../src/wad/renderer/renderGame/gameViewLayout.ts';
import { buildSectorVisibilityIndex } from '../../src/wad/renderer/utils/sectorVisibility.ts';
import { loadWadForMap, buildMapTextureLookup } from '../../test/integration/helpers/wadFixtures.ts';

const pitch = Number(process.argv[2] ?? '-0.16');
const ROOT = path.resolve(import.meta.dirname, '../..');
const gold = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png');
const tmp = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/_pitch-probe.png');

const { wad, map } = loadWadForMap('E1M1');
const tex = buildMapTextureLookup(map, wad);
const geo = buildMapGeometryCpu(map, tex);
const bsp = buildBspRenderIndex(map)!;
const sv = buildSectorVisibilityIndex(map)!;
const ss = mapToSubsectorFlats(map, bsp);
const stub = {} as never;
const walls = pathTraceWallSlicesFromWallObjects(geo.walls);
const buffers = {
  bspRenderIndex: bsp,
  sectorTriangles: geo.sectorTriangles,
  triangleHash: geo.triangleHash,
  sectorVisibility: sv,
  walls,
  flats: pathTraceFlatSlicesFromFlatObjects(geo.flats),
  subsectorFlats: ss.map((f) => ({
    position: stub,
    indices: stub,
    normal: stub,
    uv: stub,
    flatName: f.flatName,
    sector: f.sector,
    sectorIndex: f.sectorIndex,
    subsectorIndex: f.subsectorIndex,
    cpuPosition: f.position,
    cpuUv: f.uv,
    cpuIndices: f.indices,
    center: f.center,
    boundsRadius: f.boundsRadius,
  })),
  wallRangesByLine: buildWallRangesByLine(geo.walls, map.LINEDEFS.length),
  wallRangesByLineAndSide: buildWallRangesByLineAndSide(
    geo.walls.map((w) => ({ lineIndex: w.lineIndex ?? -1, sideDefIndex: w.sideDefIndex ?? -1 })),
    map.LINEDEFS.length,
    map,
  ),
} as never;

const player = map.THINGS.find((t) => t.type === 1)!;
const sector = findSectorAt(map, buffers, { x: player.x, y: player.y }) ?? map.SECTORS[29]!;
const yaw = (player.angle * Math.PI) / 180;
const viewState = {
  x: player.x,
  y: player.y,
  yaw,
  pitch,
  worldFeetZ: sector.floorheight,
  sector,
};
const cameraPos = vec3.fromValues(
  player.x,
  getPlayerEyeZ(sector, sector.floorheight),
  -player.y,
) as [number, number, number];
const drawState = buildGzdoomDrawState({
  map,
  buffers,
  viewX: player.x,
  viewY: player.y,
  viewYaw: yaw,
  cameraPos,
})!;
const layout = computeGzdoomParityViewLayout(640, 480);
const vm = mat4.create();
writePlayerViewMatrix(vm, viewState);
const pm = mat4.create();
mat4.perspective(
  pm,
  (doomVerticalFovDegrees(layout.width, layout.height) / 180) * Math.PI,
  layout.width / layout.height,
  0.1,
  64000,
);
const mvp = mat4.create();
mat4.multiply(mvp, pm, vm);
const inv = buildInvViewProj(mvp);
const rgba = renderSoftwarePlayfield({
  width: 320,
  height: 168,
  wad,
  map,
  buffers,
  drawState,
  invViewProjMatrix: inv,
  modelViewProjMatrix: mvp,
  cameraPos,
  wallTexturesByName: tex,
  animateFlatIndex: 0,
  animateWallIndex: 0,
  timeSeconds: 0,
  currentSky: sector.ceilingpic,
  viewYaw: yaw,
  viewPitch: pitch,
  eastStepOverlay: true,
  visibleSectors: drawState.visibleSectors,
});

const c = createCanvas(320, 168);
const ctx = c.getContext('2d')!;
const img = ctx.createImageData(320, 168);
img.data.set(rgba);
ctx.putImageData(img, 0, 0);
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, c.toBuffer('image/png'));

const d = await diffPlayfieldPngFiles(tmp, gold, { tolerance: 8, layout: 'gzdoom-view' });
console.log(`pitch=${pitch}: ${(d.mismatchRatio * 100).toFixed(2)}% meanAbs=${d.meanAbsDelta.toFixed(2)}`);
