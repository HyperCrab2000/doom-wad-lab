#!/usr/bin/env tsx
/** Ray pick at structural mismatch pixels (mid-upper sky vs wall). */
import fs from 'node:fs';
import { mat4, vec3 } from 'gl-matrix';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { hwWallProcessSide } from '@/wad/renderer/bsp/hwWallProcess';
import {
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
import { FROZEN_GOLD_PARITY_PITCH, doomVerticalFovDegrees } from '@/wad/parity/frame/frameParity';
import { computeGzdoomParityViewLayout, VANILLA_3D_HEIGHT, VANILLA_SCREEN_WIDTH } from '@/wad/renderer/renderGame/gameViewLayout';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import {
  isHangarLipWallSectorOccludingOutdoorSky,
  shouldSuppressLipWallForOutdoorSky,
} from '@/wad/renderer/utils/sectorSkyVisibility';

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
  const buf = fs.readFileSync('public/wads/DOOM.WAD');
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { wad, map: wad.maps.E1M1 };
}

const { wad, map } = loadE1M1();
const player = map.THINGS.find((t) => t.type === 1)!;
const sector = map.SECTORS[29]!;
const texturesByName = buildTextureLookup(map, wad);
const geometry = buildMapGeometryCpu(map, texturesByName);
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
    geometry.walls.map((w) => ({ lineIndex: w.lineIndex ?? -1, sideDefIndex: w.sideDefIndex ?? -1 })),
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
const cameraPos = vec3.fromValues(player.x, getPlayerEyeZ(sector, viewState.worldFeetZ), -player.y) as [number, number, number];
const drawState = buildGzdoomDrawState({ map, buffers, viewX: player.x, viewY: player.y, viewYaw: viewState.yaw, cameraPos })!;
const vp = gzdoomViewport(320, 168, viewState.yaw);
const pitchY = gzdoomPitchCenteryOffset(vp, FROZEN_GOLD_PARITY_PITCH);
const eye = cameraPos[1]!;

const probes = [[102, 46], [171, 42], [153, 44], [86, 48]] as const;
for (const [xi, yi] of probes) {
  console.log(`\n=== screen (${xi},${yi}) ===`);
  const hits: string[] = [];
  for (const entry of drawState.wallDrawOrder) {
    const line = map.LINEDEFS[entry.lineIndex];
    const side = map.SIDEDEFS[entry.sideDefIndex];
    if (!line || !side) continue;
    const v1 = map.VERTEXES[line.v1]!;
    const v2 = map.VERTEXES[line.v2]!;
    const sx1 = gzdoomWallScreenX(v1.x, v1.y, player.x, player.y, vp);
    const sx2 = gzdoomWallScreenX(v2.x, v2.y, player.x, player.y, vp);
    if (sx1 == null && sx2 == null) continue;
    const minSx = Math.min(sx1 ?? Infinity, sx2 ?? Infinity);
    const maxSx = Math.max(sx1 ?? -Infinity, sx2 ?? -Infinity);
    if (xi < minSx - 1 || xi > maxSx + 1) continue;
    const bands = hwWallProcessSide({
      map,
      lineDef: line,
      sideDefIndex: entry.sideDefIndex,
      otherSideDefIndex: line.sidenum[0] === entry.sideDefIndex ? line.sidenum[1] : line.sidenum[0],
      texturesByName,
    });
    for (const band of bands) {
      const sz = gzdoomScreenZ((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, player.x, player.y, viewState.yaw);
      let yTop = gzdoomWallScreenY(band.top, eye, sz, vp) + pitchY;
      let yBot = gzdoomWallScreenY(band.bottom, eye, sz, vp) + pitchY;
      const y0 = Math.min(yTop, yBot);
      const y1 = Math.max(yTop, yBot);
      if (yi < y0 - 1 || yi > y1 + 1) continue;
      const sec = side.sector;
      const lip = isHangarLipWallSectorOccludingOutdoorSky(map, sec, 29);
      const suppress = shouldSuppressLipWallForOutdoorSky(map, sec, 29, drawState.flatSupplementSectorOrder ?? new Set(), drawState.visibleFlatSectors ?? new Set());
      hits.push(`line ${entry.lineIndex} tex=${band.texName} sector=${sec} lip=${lip} suppress=${suppress} sx=${minSx.toFixed(0)}-${maxSx.toFixed(0)} y=${y0.toFixed(0)}-${y1.toFixed(0)}`);
    }
  }
  console.log(hits.slice(0, 8).join('\n') || '(no wall draw order hits)');
}
