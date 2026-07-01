import fs from 'node:fs';
import { createCanvas } from 'canvas';
import { mat4, vec3 } from 'gl-matrix';

import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { getViewAnglesFromViewMatrix, writePlayerViewMatrix } from '@/wad/renderer/controls/playerView';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '@/wad/renderer/geometry/geometryCache';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { createPlayfieldCamera, updatePlayfieldCamera } from '@/wad/renderer/renderGame/playfieldCamera';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildSceneTriangles } from '@/wad/renderer/rtgl/buildSceneTriangles';
import {
  decodePackedVertex,
  packSceneTriangles,
  TRI_SLOTS,
  TRIANGLE_TEX_WIDTH,
} from '@/wad/renderer/rtgl/packSceneTriangles';

const buf = fs.readFileSync('public/wads/DOOM.WAD');
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = wad.maps.E1M1;
const player = map.THINGS.find((t) => t.type === 1)!;
const sector = map.SECTORS[player.sectorIndex ?? 0] ?? map.SECTORS[0];

function texelByte(channel: number): number {
  return channel > 1 ? channel : channel * 255;
}

function decodeU16(lo: number, hi: number): number {
  return (texelByte(lo) + texelByte(hi) * 256) / 65535;
}

function fetchTriTexel(data: Uint8Array, triIndex: number, slot: number): [number, number, number, number] {
  const texel = triIndex * TRI_SLOTS + slot;
  const base = texel * 4;
  return [data[base] / 255, data[base + 1] / 255, data[base + 2] / 255, data[base + 3] / 255];
}

function decodeVertexGpu(
  data: Uint8Array,
  bounds: ReturnType<typeof packSceneTriangles>['bounds'],
  triIndex: number,
  vertexSlot: number
): [number, number, number] {
  const xy = fetchTriTexel(data, triIndex, vertexSlot * 2);
  const zMeta = fetchTriTexel(data, triIndex, vertexSlot * 2 + 1);
  const x = decodeU16(xy[0], xy[1]);
  const y = decodeU16(xy[2], xy[3]);
  const z = decodeU16(zMeta[0], zMeta[1]);
  return [
    x * bounds.scale[0] + bounds.origin[0],
    y * bounds.scale[1] + bounds.origin[1],
    z * bounds.scale[2] + bounds.origin[2],
  ];
}

function rayTri(
  ro: [number, number, number],
  rd: [number, number, number],
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number]
): number | null {
  const [roX, roY, roZ] = ro;
  const [rdX, rdY, rdZ] = rd;
  const e1x = v1[0] - v0[0];
  const e1y = v1[1] - v0[1];
  const e1z = v1[2] - v0[2];
  const e2x = v2[0] - v0[0];
  const e2y = v2[1] - v0[1];
  const e2z = v2[2] - v0[2];
  const px = rdY * e2z - rdZ * e2y;
  const py = rdZ * e2x - rdX * e2z;
  const pz = rdX * e2y - rdY * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-6) return null;
  const invDet = 1 / det;
  const tvx = roX - v0[0];
  const tvy = roY - v0[1];
  const tvz = roZ - v0[2];
  const u = (tvx * px + tvy * py + tvz * pz) * invDet;
  if (u < 0 || u > 1) return null;
  const qx = tvy * e1z - tvz * e1y;
  const qy = tvz * e1x - tvx * e1z;
  const qz = tvx * e1y - tvy * e1x;
  const v = (rdX * qx + rdY * qy + rdZ * qz) * invDet;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  return t > 0.05 ? t : null;
}

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

const viewMatrix = mat4.create();
writePlayerViewMatrix(viewMatrix, {
  x: player.x,
  y: player.y,
  yaw: (player.angle * Math.PI) / 180,
  pitch: 0,
  worldFeetZ: sector.floorheight,
  sector,
});
const playfield = createPlayfieldCamera();
updatePlayfieldCamera(playfield, 1280, 900, 45, 0.1, 64000, viewMatrix, mat4.create());
const invView = mat4.invert(mat4.create(), viewMatrix)!;
const eye: [number, number, number] = [invView[12], invView[13], invView[14]];
const { yaw } = getViewAnglesFromViewMatrix(viewMatrix);
const drawState = buildGzdoomDrawState({
  map,
  buffers,
  viewX: player.x,
  viewY: player.y,
  viewYaw: yaw,
  cameraPos: eye,
});
const tris = buildSceneTriangles(map, buffers, drawState);
const packed = packSceneTriangles(tris, new Map(), new Map(), new Map());

let maxErr = 0;
for (let i = 0; i < Math.min(20, tris.length); i++) {
  for (let v = 0; v < 3; v++) {
    const cpu = decodePackedVertex(packed.dataBytes, i, v as 0 | 1 | 2, packed.bounds);
    const gpu = decodeVertexGpu(packed.dataBytes, packed.bounds, i, v);
    maxErr = Math.max(maxErr, Math.abs(cpu[0] - gpu[0]), Math.abs(cpu[1] - gpu[1]), Math.abs(cpu[2] - gpu[2]));
  }
}
console.log('decode maxErr', maxErr);

const w = 320;
const h = 168;
const SKY = [115, 158, 224];
const out = new Uint8Array(w * h * 4);
for (let py = 0; py < h; py++) {
  const ndcY = 1 - (py + 0.5) / h * 2;
  for (let px = 0; px < w; px++) {
    const ndcX = (px + 0.5) / w * 2 - 1;
    const near: [number, number, number] = [0, 0, 0];
    const far: [number, number, number] = [0, 0, 0];
    for (const [ndcZ, outPt] of [
      [-1, near],
      [1, far],
    ] as const) {
      const x =
        playfield.invViewProjMatrix[0] * ndcX +
        playfield.invViewProjMatrix[4] * ndcY +
        playfield.invViewProjMatrix[8] * ndcZ +
        playfield.invViewProjMatrix[12];
      const y =
        playfield.invViewProjMatrix[1] * ndcX +
        playfield.invViewProjMatrix[5] * ndcY +
        playfield.invViewProjMatrix[9] * ndcZ +
        playfield.invViewProjMatrix[13];
      const z =
        playfield.invViewProjMatrix[2] * ndcX +
        playfield.invViewProjMatrix[6] * ndcY +
        playfield.invViewProjMatrix[10] * ndcZ +
        playfield.invViewProjMatrix[14];
      const ww =
        playfield.invViewProjMatrix[3] * ndcX +
        playfield.invViewProjMatrix[7] * ndcY +
        playfield.invViewProjMatrix[11] * ndcZ +
        playfield.invViewProjMatrix[15];
      outPt[0] = x / ww;
      outPt[1] = y / ww;
      outPt[2] = z / ww;
    }
    const rd: [number, number, number] = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    const len = Math.hypot(...rd);
    rd[0] /= len;
    rd[1] /= len;
    rd[2] /= len;
    let bestT = 1e30;
    for (let i = 0; i < tris.length; i++) {
      const v0 = decodeVertexGpu(packed.dataBytes, packed.bounds, i, 0);
      const v1 = decodeVertexGpu(packed.dataBytes, packed.bounds, i, 1);
      const v2 = decodeVertexGpu(packed.dataBytes, packed.bounds, i, 2);
      const t = rayTri(near, rd, v0, v1, v2);
      if (t !== null && t < bestT) bestT = t;
    }
    const idx = (py * w + px) * 4;
    if (bestT >= 1e30) {
      out[idx] = SKY[0];
      out[idx + 1] = SKY[1];
      out[idx + 2] = SKY[2];
      out[idx + 3] = 255;
    } else {
      out[idx] = 80;
      out[idx + 1] = 80;
      out[idx + 2] = 80;
      out[idx + 3] = 255;
    }
  }
}

let nonSky = 0;
for (let i = 0; i < out.length; i += 4) {
  if (!(out[i] === SKY[0] && out[i + 1] === SKY[1] && out[i + 2] === SKY[2])) nonSky++;
}
const canvas = createCanvas(w, h);
const ctx = canvas.getContext('2d')!;
const img = ctx.createImageData(w, h);
img.data.set(out);
ctx.putImageData(img, 0, 0);
fs.mkdirSync('tmp-e1m1-verify', { recursive: true });
fs.writeFileSync('tmp-e1m1-verify/cpu-gpu-decode-sim.png', canvas.toBuffer('image/png'));
console.log('nonSky', nonSky, 'ratio', (nonSky / (w * h)).toFixed(3));
