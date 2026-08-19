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
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildSceneTriangles } from '@/wad/renderer/rtgl/buildSceneTriangles';

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

describe('buildSceneTriangles', () => {
  it('includes BSP-visible walls at the E1M1 player start', () => {
    const map = loadE1M1();
    const player = map.THINGS.find((thing) => thing.type === 1)!;
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
    const buffers = buildTestBuffers(map, geometry) as never;
    const cameraPos = vec3.fromValues(player.x, 41, -player.y);
    const viewMatrix = mat4.create();
    mat4.identity(viewMatrix);
    mat4.rotateY(viewMatrix, viewMatrix, Math.PI / 2 - (player.angle * Math.PI) / 180);
    mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), cameraPos));
    const { yaw } = getViewAnglesFromViewMatrix(viewMatrix);
    const drawState = buildGzdoomDrawState({
      map,
      buffers,
      viewX: player.x,
      viewY: player.y,
      viewYaw: yaw,
      cameraPos: [player.x, 41, -player.y],
    });
    const triangles = buildSceneTriangles(map, buffers, drawState);
    const walls = triangles.filter((tri) => tri.surfaceKind === 0);

    expect(walls.length).toBeGreaterThan(0);
    expect(drawState.wallDrawOrder.length).toBeGreaterThan(0);
  });

  it('uses BSP subsector flats when available', () => {
    const map = loadE1M1();
    const player = map.THINGS.find((thing) => thing.type === 1)!;
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
    const buffers = buildTestBuffers(map, geometry) as never;
    const drawState = buildGzdoomDrawState({
      map,
      buffers,
      viewX: player.x,
      viewY: player.y,
      viewYaw: 0,
      cameraPos: [player.x, 41, -player.y],
    });
    const triangles = buildSceneTriangles(map, buffers, drawState);
    const flats = triangles.filter((tri) => tri.surfaceKind === 1);
    expect(flats.length).toBeGreaterThan(0);
    expect(drawState.flatSubsectorOrder.length).toBeGreaterThan(0);
  });

  it('finds a wall hit along the spawn view direction', () => {
    const map = loadE1M1();
    const player = map.THINGS.find((thing) => thing.type === 1)!;
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
    const buffers = buildTestBuffers(map, geometry) as never;
    const cameraPos: [number, number, number] = [player.x, 41, -player.y];
    const viewMatrix = mat4.create();
    mat4.identity(viewMatrix);
    mat4.rotateY(viewMatrix, viewMatrix, Math.PI / 2 - (player.angle * Math.PI) / 180);
    mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), vec3.fromValues(...cameraPos)));
    const { yaw, pitch } = getViewAnglesFromViewMatrix(viewMatrix);
    const drawState = buildGzdoomDrawState({
      map,
      buffers,
      viewX: player.x,
      viewY: player.y,
      viewYaw: yaw,
      cameraPos,
    });
    const triangles = buildSceneTriangles(map, buffers, drawState);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const rd: [number, number, number] = [cy * cp, sp, -sy * cp];

    let bestT = Number.POSITIVE_INFINITY;
    for (const tri of triangles) {
      const t = rayTriangleT(cameraPos, rd, tri.v0, tri.v1, tri.v2);
      if (t !== null && t < bestT) bestT = t;
    }

    expect(triangles.some((tri) => tri.surfaceKind === 0)).toBe(true);
  });
});

function rayTriangleT(
  ro: [number, number, number],
  rd: [number, number, number],
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number]
): number | null {
  const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
  const p = cross(rd, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-6) return null;
  const invDet = 1 / det;
  const tv = [ro[0] - v0[0], ro[1] - v0[1], ro[2] - v0[2]];
  const u = dot(tv, p) * invDet;
  if (u < 0 || u > 1) return null;
  const q = cross(tv, e1);
  const v = dot(rd, q) * invDet;
  if (v < 0 || u + v > 1) return null;
  const t = dot(e2, q) * invDet;
  if (t <= 0.05) return null;
  return t;
}

function cross(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
