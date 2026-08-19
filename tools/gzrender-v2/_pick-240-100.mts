#!/usr/bin/env tsx
import fs from 'node:fs';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState, isE1M1SpawnEastStepWallLine, isE1M1SpawnRightLipWallLine } from '@/wad/renderer/bsp/gzdoomDrawState';
import { hwWallProcessSide } from '@/wad/renderer/bsp/hwWallProcess';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import { buildWallRangesByLineAndSide } from '@/wad/renderer/geometry/geometryCache';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { getPlayerEyeZ } from '@/wad/renderer/controls/playerView';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { FROZEN_GOLD_PARITY_PITCH } from '@/wad/parity/frame/frameParity';
import {
  gzdoomPitchCenteryOffset,
  gzdoomScreenZ,
  gzdoomViewport,
  gzdoomWallScreenX,
  gzdoomWallScreenY,
} from '@/wad/parity/frame/gzdoomScreenZ';

const wad = loadWadFromArrayBuffer(fs.readFileSync('public/wads/DOOM.WAD').buffer);
const map = wad.maps.E1M1;
const player = map.THINGS.find((t) => t.type === 1)!;
const sector = map.SECTORS[29]!;
const geometry = buildMapGeometryCpu(map, {});
const bspRenderIndex = buildBspRenderIndex(map)!;
const sectorVisibility = buildSectorVisibilityIndex(map)!;
const buffers = {
  bspRenderIndex,
  sectorVisibility,
  flats: geometry.flats,
  subsectorFlats: mapToSubsectorFlats(map, bspRenderIndex),
  sectorTriangles: geometry.sectorTriangles,
  triangleHash: geometry.triangleHash,
  walls: geometry.walls,
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
const vp = gzdoomViewport(320, 168, yaw);
const pitchY = gzdoomPitchCenteryOffset(vp, FROZEN_GOLD_PARITY_PITCH);
const eye = cameraPos[1]!;

const xi = 240;
const yi = 100;
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
  const bands = hwWallProcessSide({ map, lineDef: line, sideDefIndex: entry.sideDefIndex, otherSideDefIndex: line.sidenum[0] === entry.sideDefIndex ? line.sidenum[1] : line.sidenum[0], texturesByName: {} });
  for (const band of bands) {
    const sz = gzdoomScreenZ((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, player.x, player.y, yaw);
    const yTop = gzdoomWallScreenY(band.top, eye, sz, vp) + pitchY;
    const yBot = gzdoomWallScreenY(band.bottom, eye, sz, vp) + pitchY;
    const y0 = Math.min(yTop, yBot);
    const y1 = Math.max(yTop, yBot);
    if (yi < y0 - 1 || yi > y1 + 1) continue;
    const gpuSkip =
      isE1M1SpawnEastStepWallLine(entry.lineIndex) ||
      isE1M1SpawnRightLipWallLine(entry.lineIndex) ||
      entry.lineIndex === 53;
    hits.push(
      `line ${entry.lineIndex} tex=${band.texName} gpuSkip=${gpuSkip} sx=${minSx.toFixed(0)}-${maxSx.toFixed(0)} y=${y0.toFixed(0)}-${y1.toFixed(0)}`,
    );
  }
}
console.log(`probe (${xi},${yi}) hits=${hits.length}`);
console.log(hits.slice(0, 15).join('\n') || '(none)');
