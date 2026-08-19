#!/usr/bin/env tsx
/** Brute lip offset at probe columns. */
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
import {
  gzdoomColormapIndex,
  shadePalIndex,
  wallShadeOffsetBands,
  wallVisibility,
} from '@/wad/parity/frame/gzdoomColormap';
import { FROZEN_GOLD_PARITY_PITCH } from '@/wad/parity/frame/frameParity';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';

const wadPath = path.resolve('public/wads/DOOM.WAD');
const buf = fs.readFileSync(wadPath);
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = wad.maps.E1M1;
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
const spawnInv = mat4.invert(mat4.create(), viewMatrix)!;
const cameraPos = vec3.fromValues(spawnInv[12], spawnInv[13], spawnInv[14]) as [number, number, number];

const gold = [31, 23, 11];
const probes = [
  [60, 52],
  [64, 55],
] as const;

for (const lipExtra of [2.75, 2.8, 2.85, 2.875, 2.9, 2.925, 2.95, 3.0, 3.05]) {
  const parts: string[] = [];
  for (const [xi, yi] of probes) {
    const pfY = 168 - 1 - yi;
    let bands = wallShadeOffsetBands(xi, pfY, true);
    bands = bands - 2.925 + lipExtra;
    const light = sector.lightlevel;
    const vis = 0.045;
    const band = gzdoomColormapIndex(light, vis, bands);
    const rgb = shadePalIndex(wad.playpal, wad.colormap, 96, light, vis, bands);
    const d = Math.max(Math.abs(rgb[0]! - gold[0]!), Math.abs(rgb[1]! - gold[1]!), Math.abs(rgb[2]! - gold[2]!));
    parts.push(`(${xi},${yi})=${rgb.join(',')} d=${d}`);
  }
  console.log(`lip+${lipExtra}: ${parts.join(' | ')}`);
}

// live bands at probes
for (const [xi, yi] of probes) {
  const pfY = 168 - 1 - yi;
  console.log(`bands (${xi},${yi}) pfY=${pfY}:`, wallShadeOffsetBands(xi, pfY, true));
}
