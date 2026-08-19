import fs from 'node:fs';
import path from 'node:path';
import { mat4, vec3 } from 'gl-matrix';
import { describe, expect, it } from 'vitest';

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
import { buildInvViewProj, unprojectPoint } from '@/wad/renderer/rtgl/pathTraceCpu';
import {
  decodePackedVertex,
  packSceneTriangles,
} from '@/wad/renderer/rtgl/packSceneTriangles';

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

function buildTextureLookup(map: ReturnType<typeof loadE1M1>) {
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }
  const texturesByName: Record<string, { name: string; width: number; height: number; transparent: boolean; graphics: never }> = {};
  for (const name of texNames) {
    texturesByName[name] = { name, width: 64, height: 128, transparent: false, graphics: {} as never };
  }
  return texturesByName;
}

function buildTestBuffers(map: ReturnType<typeof loadE1M1>, geometry: ReturnType<typeof buildMapGeometryCpu>) {
  const bspRenderIndex = buildBspRenderIndex(map);
  const subsectorFlatObjects = mapToSubsectorFlats(map, bspRenderIndex);
  return {
    bspRenderIndex,
    walls: pathTraceWallSlicesFromWallObjects(geometry.walls),
    flats: pathTraceFlatSlicesFromFlatObjects(geometry.flats),
    subsectorFlats: pathTraceFlatSlicesFromFlatObjects(subsectorFlatObjects),
    wallRangesByLine: buildWallRangesByLine(geometry.walls, map.LINEDEFS.length),
    wallRangesByLineAndSide: buildWallRangesByLineAndSide(
      geometry.walls.map((wall) => ({
        lineIndex: wall.lineIndex ?? -1,
        sideDefIndex: wall.sideDefIndex ?? -1,
      })),
      map.LINEDEFS.length,
      map
    ),
  };
}

function rayTriangleHit(
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
  if (t <= 0.05) return null;
  return t;
}

function centerRay(
  invViewProj: mat4,
  width: number,
  height: number
): { ro: [number, number, number]; rd: [number, number, number] } {
  const px = Math.floor(width / 2);
  const py = Math.floor(height / 2);
  const ndcX = (px + 0.5) / width * 2 - 1;
  const ndcY = 1 - (py + 0.5) / height * 2;
  const near: [number, number, number] = [0, 0, 0];
  const far: [number, number, number] = [0, 0, 0];
  unprojectPoint(invViewProj, ndcX, ndcY, -1, near);
  unprojectPoint(invViewProj, ndcX, ndcY, 1, far);
  const rdX = far[0] - near[0];
  const rdY = far[1] - near[1];
  const rdZ = far[2] - near[2];
  const len = Math.hypot(rdX, rdY, rdZ);
  return { ro: near, rd: [rdX / len, rdY / len, rdZ / len] };
}

describe('pathTraceGpuDecode', () => {
  it('E1M1 packed vertices stay accurate enough for center-ray hits', () => {
    const map = loadE1M1();
    const player = map.THINGS.find((thing) => thing.type === 1)!;
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
    const buffers = buildTestBuffers(map, geometry) as never;
    const cameraPos: [number, number, number] = [player.x, 41, -player.y];
    const viewMatrix = mat4.create();
    mat4.identity(viewMatrix);
    mat4.rotateY(viewMatrix, viewMatrix, Math.PI / 2 - (player.angle * Math.PI) / 180);
    mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), vec3.fromValues(...cameraPos)));

    const layout = computeGameViewLayout(1280, 900);
    const projectionMatrix = mat4.create();
    mat4.perspective(
      projectionMatrix,
      (45 * Math.PI) / 180,
      layout.width / layout.height,
      0.1,
      64000
    );
    const modelViewProj = mat4.create();
    mat4.multiply(modelViewProj, projectionMatrix, viewMatrix);
    const invViewProj = buildInvViewProj(modelViewProj);

    const { yaw } = getViewAnglesFromViewMatrix(viewMatrix);
    const drawState = buildGzdoomDrawState({
      map,
      buffers,
      viewX: player.x,
      viewY: player.y,
      viewYaw: yaw,
      cameraPos,
    });
    const triangles = buildSceneTriangles(map, buffers, drawState);
    const packed = packSceneTriangles(triangles, new Map(), new Map(), new Map());

    let maxErr = 0;
    for (let i = 0; i < triangles.length; i++) {
      for (let v = 0; v < 3; v++) {
        const decoded = decodePackedVertex(packed.dataBytes, i, v as 0 | 1 | 2, packed.bounds);
        const src = [triangles[i].v0, triangles[i].v1, triangles[i].v2][v];
        maxErr = Math.max(maxErr, Math.abs(decoded[0] - src[0]), Math.abs(decoded[1] - src[1]), Math.abs(decoded[2] - src[2]));
      }
    }
    expect(maxErr).toBeLessThan(1.0);

    const traceW = 320;
    const traceH = 168;
    const { ro, rd } = centerRay(invViewProj, traceW, traceH);

    let rawHits = 0;
    let packedHits = 0;
    for (const tri of triangles) {
      if (rayTriangleHit(ro, rd, tri.v0, tri.v1, tri.v2) !== null) rawHits++;
    }
    for (let i = 0; i < triangles.length; i++) {
      const v0 = decodePackedVertex(packed.dataBytes, i, 0, packed.bounds);
      const v1 = decodePackedVertex(packed.dataBytes, i, 1, packed.bounds);
      const v2 = decodePackedVertex(packed.dataBytes, i, 2, packed.bounds);
      if (rayTriangleHit(ro, rd, v0, v1, v2) !== null) packedHits++;
    }

    expect(triangles.length).toBeGreaterThan(0);
    if (rawHits > 0) {
      expect(packedHits).toBeGreaterThan(0);
      expect(packedHits).toBeGreaterThanOrEqual(rawHits * 0.8);
    }
  });
});
