#!/usr/bin/env tsx
/** Screen coverage of mesh wall bands at probe pixels. */
import fs from 'node:fs';
import { mat4, vec4 } from 'gl-matrix';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { wallSliceForEntry } from '@/wad/renderer/gzdoom/gzdoomRenderer';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { buildWallRangesByLineAndSide } from '@/wad/renderer/geometry/geometryCache';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { getPlayerEyeZ, writePlayerViewMatrix, type PlayerViewState } from '@/wad/renderer/controls/playerView';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { FROZEN_GOLD_PARITY_PITCH } from '@/wad/parity/frame/frameParity';
import { computeGzdoomParityViewLayout } from '@/wad/renderer/renderGame/gameViewLayout';

function project(
  mvp: mat4,
  x: number,
  y: number,
  z: number,
  layout: ReturnType<typeof computeGzdoomParityViewLayout>,
): { sx: number; sy: number } | null {
  const out = vec4.create();
  vec4.transformMat4(out, vec4.fromValues(x, y, z, 1), mvp);
  if (out[3]! <= 0) return null;
  const ndcX = out[0]! / out[3]!;
  const ndcY = out[1]! / out[3]!;
  const glX = ((ndcX + 1) * layout.width) / 2;
  const glY = layout.glY + ((ndcY + 1) * layout.height) / 2;
  const pfX = glX * (320 / layout.width);
  const screenY = glY - layout.glY;
  const pfY = (layout.height - screenY) * (168 / layout.height);
  return { sx: pfX, sy: pfY };
}

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
const layout = computeGzdoomParityViewLayout(640, 480);
const aspect = 640 / 480;
const projectionMatrix = mat4.create();
mat4.perspective(projectionMatrix, (106 * Math.PI) / 180, aspect, 5, 65536);
const mvp = mat4.create();
mat4.multiply(mvp, projectionMatrix, viewMatrix);

const cameraPos = [player.x, getPlayerEyeZ(sector, sector.floorheight), -player.y] as [number, number, number];
const drawState = buildGzdoomDrawState({
  map,
  buffers,
  viewX: player.x,
  viewY: player.y,
  viewYaw: viewState.yaw,
  cameraPos,
})!;

const probes = [
  [171, 42],
  [102, 46],
  [153, 44],
] as const;

for (const [xi, yi] of probes) {
  console.log(`\n=== probe (${xi},${yi}) ===`);
  const hits: string[] = [];
  for (const entry of drawState.wallDrawOrder) {
    const range = wallSliceForEntry(buffers, map, entry.lineIndex, entry.sideDefIndex);
    if (!range) continue;
    for (let wi = range.start; wi < range.start + range.count; wi++) {
      const wall = geometry.walls[wi];
      if (!wall) continue;
      const pos = wall.cpuPosition;
      let minSx = Infinity,
        maxSx = -Infinity,
        minSy = Infinity,
        maxSy = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        const p = project(mvp, pos[i]!, pos[i + 1]!, pos[i + 2]!, layout);
        if (!p) continue;
        minSx = Math.min(minSx, p.sx);
        maxSx = Math.max(maxSx, p.sx);
        minSy = Math.min(minSy, p.sy);
        maxSy = Math.max(maxSy, p.sy);
      }
      if (!Number.isFinite(minSx)) continue;
      if (xi < minSx - 1 || xi > maxSx + 1 || yi < minSy - 1 || yi > maxSy + 1) continue;
      hits.push(
        `line ${entry.lineIndex} tex=${wall.textureName ?? '?'} sx=${minSx.toFixed(0)}-${maxSx.toFixed(0)} sy=${minSy.toFixed(0)}-${maxSy.toFixed(0)}`,
      );
    }
  }
  console.log(hits.slice(0, 12).join('\n') || '(no mesh wall hits)');
}
