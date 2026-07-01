import fs from 'node:fs';
import { createCanvas } from 'canvas';
import { mat4, vec3 } from 'gl-matrix';

import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { getViewAnglesFromViewMatrix } from '@/wad/renderer/controls/playerView';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '@/wad/renderer/geometry/geometryCache';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { computeGameViewLayout } from '@/wad/renderer/renderGame/gameViewLayout';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildSceneTriangles } from '@/wad/renderer/rtgl/buildSceneTriangles';
import { buildInvViewProj, renderPathTraceCpu } from '@/wad/renderer/rtgl/pathTraceCpu';

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
const texturesByName = Object.fromEntries(
  [...texNames].map((n) => [n, { name: n, width: 64, height: 128, transparent: false, graphics: {} as never }])
);
const geometry = buildMapGeometryCpu(map, texturesByName);
const bspRenderIndex = buildBspRenderIndex(map);
const subsectorFlatObjects = mapToSubsectorFlats(map, bspRenderIndex);
const buffers = {
  bspRenderIndex,
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
const cameraPos: [number, number, number] = [player.x, 41, -player.y];
const viewMatrix = mat4.create();
mat4.identity(viewMatrix);
mat4.rotateY(viewMatrix, viewMatrix, Math.PI / 2 - (player.angle * Math.PI) / 180);
mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), vec3.fromValues(...cameraPos)));
const layout = computeGameViewLayout(1280, 900);
const projectionMatrix = mat4.create();
mat4.perspective(projectionMatrix, (45 * Math.PI) / 180, layout.width / layout.height, 0.1, 64000);
const mvp = mat4.create();
mat4.multiply(mvp, projectionMatrix, viewMatrix);
const inv = buildInvViewProj(mvp);
const { yaw } = getViewAnglesFromViewMatrix(viewMatrix);
const drawState = buildGzdoomDrawState({
  map,
  buffers,
  viewX: player.x,
  viewY: player.y,
  viewYaw: yaw,
  cameraPos,
});
const tris = buildSceneTriangles(map, buffers, drawState);
const w = 320;
const h = 168;
const px = renderPathTraceCpu(tris, inv, { wallColors: new Map(), floorColors: new Map() }, new Array(256).fill(0.75), w, h);
let nonSky = 0;
for (let i = 0; i < px.length; i += 4) {
  if (!(px[i] === 115 && px[i + 1] === 158 && px[i + 2] === 224)) nonSky++;
}
const canvas = createCanvas(w, h);
const ctx = canvas.getContext('2d')!;
const img = ctx.createImageData(w, h);
img.data.set(px);
ctx.putImageData(img, 0, 0);
fs.mkdirSync('tmp-e1m1-verify', { recursive: true });
fs.writeFileSync('tmp-e1m1-verify/cpu-manual-camera.png', canvas.toBuffer('image/png'));
console.log(JSON.stringify({ nonSky, tris: tris.length, layout }, null, 2));
