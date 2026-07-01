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
import { buildInvViewProj, pathTraceCpuResolution, renderPathTraceCpu } from '@/wad/renderer/rtgl/pathTraceCpu';

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

describe('pathTraceCpu', () => {
  it('renders a non-empty E1M1 spawn view within a few seconds', () => {
    const map = loadE1M1();
    const player = map.THINGS.find((thing) => thing.type === 1)!;
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
    const buffers = buildTestBuffers(map, geometry) as never;
    const cameraPos: [number, number, number] = [player.x, 41, -player.y];
    const viewMatrix = mat4.create();
    mat4.identity(viewMatrix);
    mat4.rotateY(viewMatrix, viewMatrix, Math.PI / 2 - (player.angle * Math.PI) / 180);
    mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), vec3.fromValues(...cameraPos)));
    const projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, (110 * Math.PI) / 180, 16 / 9, 0.1, 10000);
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
    const { width, height } = pathTraceCpuResolution(320, 180);
    const wallColors = new Map<string, [number, number, number]>([['STARTAN3', [0.55, 0.55, 0.55]]]);
    const floorColors = new Map<string, [number, number, number]>([['FLOOR4_8', [0.35, 0.35, 0.35]]]);
    const sectorLight = new Array(256).fill(0.75);

    const started = performance.now();
    const pixels = renderPathTraceCpu(
      triangles,
      invViewProj,
      { wallColors, floorColors },
      sectorLight,
      width,
      height
    );
    const elapsed = performance.now() - started;

    let nonSky = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== 115 || pixels[i + 1] !== 158 || pixels[i + 2] !== 224) nonSky++;
    }

    expect(triangles.length).toBeGreaterThan(0);
    expect(nonSky).toBeGreaterThan(width * height * 0.2);
    const maxMs = process.env.VITEST_COVERAGE === '1' ? 20_000 : 12_000;
    expect(elapsed).toBeLessThan(maxMs);
  });
});
