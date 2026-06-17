import fs from 'node:fs';
import { mat4 } from 'gl-matrix';

import { buildBspRenderIndex } from '../src/wad/renderer/bsp/bspRenderIndex.ts';
import { buildGzdoomDrawState } from '../src/wad/renderer/bsp/gzdoomDrawState.ts';
import { findSectorAt } from '../src/wad/renderer/controls/doomPlayerControls.ts';
import { getViewAnglesFromViewMatrix, writePlayerViewMatrix } from '../src/wad/renderer/controls/playerView.ts';
import { buildMapGeometryInWorker } from '../src/wad/renderer/workers/geometryWorkerClient.ts';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '../src/wad/renderer/geometry/geometryCache.ts';
import { mapToSubsectorFlats } from '../src/wad/renderer/geometry/mapToSubsectorFlats.ts';
import { loadWadFromArrayBuffer } from '../src/wad/parser/loadWadFromArrayBuffer.ts';
import { buildSceneTriangles } from '../src/wad/renderer/rtgl/buildSceneTriangles.ts';
import { buildSectorTriangleHash } from '../src/wad/renderer/utils/sectorLookup.ts';
import { createPlayfieldCamera, updatePlayfieldCamera } from '../src/wad/renderer/renderGame/playfieldCamera.ts';

const buf = fs.readFileSync('public/wads/DOOM.WAD');
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = wad.maps.E1M1;
const player = map.THINGS.find((t) => t.type === 1)!;

const texNames = new Set<string>();
for (const side of map.SIDEDEFS) {
  for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
    if (tex && tex !== '-') texNames.add(tex);
  }
}
const texLookup = Object.fromEntries(
  [...texNames].map((n) => [n, { name: n, width: 64, height: 128, transparent: false, graphics: {} }])
);

async function main() {
const geometry = await buildMapGeometryInWorker(map, texLookup);
const bsp = buildBspRenderIndex(map)!;
const subsectorFlatObjects = mapToSubsectorFlats(map, bsp);
const sectorTriangles = buildSectorTriangleHash(map, geometry.sectorTriangles);
const buffers = {
  bspRenderIndex: bsp,
  sectorTriangles,
  triangleHash: null,
  walls: pathTraceWallSlicesFromWallObjects(geometry.walls),
  flats: pathTraceFlatSlicesFromFlatObjects(geometry.flats),
  subsectorFlats: pathTraceFlatSlicesFromFlatObjects(subsectorFlatObjects),
  wallRangesByLine: buildWallRangesByLine(geometry.walls, map.LINEDEFS.length),
  wallRangesByLineAndSide: buildWallRangesByLineAndSide(
    geometry.walls.map((w) => ({ lineIndex: w.lineIndex ?? -1, sideDefIndex: w.sideDefIndex ?? -1 })),
    map.LINEDEFS.length,
    map
  ),
};

const startSector = findSectorAt(map, buffers, { x: player.x, y: player.y });
const viewMatrix = mat4.create();
writePlayerViewMatrix(viewMatrix, {
  x: player.x,
  y: player.y,
  yaw: (player.angle * Math.PI) / 180,
  pitch: 0,
  worldFeetZ: startSector?.floorheight ?? 0,
  sector: startSector,
});
const invView = mat4.invert(mat4.create(), viewMatrix)!;
const eye: [number, number, number] = [invView[12], invView[13], invView[14]];
const { yaw } = getViewAnglesFromViewMatrix(viewMatrix);
const drawState = buildGzdoomDrawState({
  map,
  buffers,
  viewX: eye[0],
  viewY: -eye[2],
  viewYaw: yaw,
  cameraPos: eye,
});
const tris = buildSceneTriangles(map, buffers, drawState);
const playfield = createPlayfieldCamera();
updatePlayfieldCamera(playfield, 1280, 900, 45, 0.1, 64000, viewMatrix, mat4.create());
console.log(
  JSON.stringify(
    {
      triCount: tris.length,
      drawWalls: drawState.wallDrawOrder.length,
      firstTri: tris[0]?.v0,
      wallTris: tris.filter((t) => t.surfaceKind === 0).length,
      flatTris: tris.filter((t) => t.surfaceKind === 1).length,
      invViewProj: Array.from(playfield.invViewProjMatrix),
      playfield: playfield.layout,
    },
    null,
    2
  )
);
}

void main();
