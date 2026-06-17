import fs from 'node:fs';
import path from 'node:path';
import { mat4 } from 'gl-matrix';
import { describe, expect, it } from 'vitest';

import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import {
  buildGzdoomDrawState,
  filterDrawStateForRayTraceGeometry,
} from '@/wad/renderer/bsp/gzdoomDrawState';
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
  collectRayTracedVisibleGeometry,
  extendRayTraceGeometryCourtyardLips,
} from '@/wad/renderer/rtgl/collectRayTracedVisibleSectors';
import { countGzdoomMeshWireframeSegments } from '@/wad/renderer/modular/drawGzdoomMeshWireframe';

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

function buildDrawStateAt(
  map: ReturnType<typeof loadE1M1>,
  buffers: ReturnType<typeof buildTestBuffers>,
  viewX: number,
  viewY: number,
  viewYaw: number,
  cameraPos: [number, number, number]
) {
  const drawState = buildGzdoomDrawState({
    map,
    buffers: buffers as never,
    viewX,
    viewY,
    viewYaw,
    cameraPos,
  })!;
  const viewMatrix = mat4.create();
  writePlayerViewMatrix(viewMatrix, {
    x: viewX,
    y: viewY,
    yaw: viewYaw,
    pitch: 0,
    worldFeetZ: map.SECTORS[drawState.cameraSectorIndex]?.floorheight ?? 0,
    sector: map.SECTORS[drawState.cameraSectorIndex] ?? map.SECTORS[0]!,
  });
  const modelMatrix = mat4.create();
  const playfield = createPlayfieldCamera();
  updatePlayfieldCamera(playfield, 640, 400, 45, 0.1, 64000, viewMatrix, modelMatrix);
  return { drawState, invViewProj: playfield.invViewProjMatrix };
}

describe('collectRayTracedVisibleGeometry', () => {
  it('E1M1 spawn ray hits are a subset of mesh draw sectors', () => {
    const map = loadE1M1();
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
    const buffers = buildTestBuffers(map, geometry);
    const player = map.THINGS.find((thing) => thing.type === 1)!;
    const sector = map.SECTORS[player.sectorIndex ?? 0] ?? map.SECTORS[0];
    const { drawState, invViewProj } = buildDrawStateAt(
      map,
      buffers,
      player.x,
      player.y,
      (player.angle * Math.PI) / 180,
      [player.x, sector.floorheight + 41, -player.y]
    );

    const triangles = buildSceneTriangles(map, buffers as never, drawState);
    const geom = collectRayTracedVisibleGeometry(triangles, invViewProj, 320, 200, {
      sampleStep: 4,
    });

    const meshPool = new Set(drawState.visibleSectors);
    for (const entry of drawState.wallDrawOrder) {
      const sectorIndex = map.SIDEDEFS[entry.sideDefIndex]?.sector ?? -1;
      if (sectorIndex >= 0) meshPool.add(sectorIndex);
    }

    expect(geom.sectors.size).toBeGreaterThan(0);
    for (const sectorIndex of geom.sectors) {
      expect(meshPool.has(sectorIndex)).toBe(true);
    }
  });

  it('ray-traced wireframe draws fewer segments than portal mesh draw at spawn', () => {
    const map = loadE1M1();
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
    const buffers = buildTestBuffers(map, geometry);
    const player = map.THINGS.find((thing) => thing.type === 1)!;
    const sector = map.SECTORS[player.sectorIndex ?? 0] ?? map.SECTORS[0];
    const { drawState, invViewProj } = buildDrawStateAt(
      map,
      buffers,
      player.x,
      player.y,
      (player.angle * Math.PI) / 180,
      [player.x, sector.floorheight + 41, -player.y]
    );

    const triangles = buildSceneTriangles(map, buffers as never, drawState);
    const geom = collectRayTracedVisibleGeometry(triangles, invViewProj, 320, 200, {
      sampleStep: 4,
    });
    geom.subsectors.add(drawState.cameraSubsector);
    const rtDrawState = filterDrawStateForRayTraceGeometry(drawState, geom);

    const portalSegs = countGzdoomMeshWireframeSegments(
      map,
      buffers as never,
      drawState,
      'boundary',
      'portal'
    );
    const rtSegs = countGzdoomMeshWireframeSegments(
      map,
      buffers as never,
      rtDrawState,
      'boundary',
      'portal'
    );

    expect(rtSegs.wallSegments).toBeLessThanOrEqual(portalSegs.wallSegments);
    expect(rtSegs.flatSegments).toBeLessThanOrEqual(portalSegs.flatSegments);
    expect(rtSegs.wallSegments + rtSegs.flatSegments).toBeGreaterThan(0);
  });

  it('sector 43 north excludes spawn/hangar from ray-traced wireframe flats', () => {
    const map = loadE1M1();
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
    const buffers = buildTestBuffers(map, geometry);
    const { drawState, invViewProj } = buildDrawStateAt(
      map,
      buffers,
      -192,
      -3128,
      -Math.PI / 2,
      [-192, 41, 3128]
    );

    const triangles = buildSceneTriangles(map, buffers as never, drawState);
    const geom = collectRayTracedVisibleGeometry(triangles, invViewProj, 320, 200, {
      sampleStep: 3,
    });
    geom.subsectors.add(drawState.cameraSubsector);
    extendRayTraceGeometryCourtyardLips(map, null, drawState, buffers.bspRenderIndex, geom);
    const rtDrawState = filterDrawStateForRayTraceGeometry(drawState, geom);

    const flatSectors = new Set(
      rtDrawState.flatSubsectorOrder.map((sub) => buffers.bspRenderIndex.subsectorToSector[sub] ?? -1)
    );
    expect(flatSectors.has(0)).toBe(false);
    expect(flatSectors.has(70)).toBe(false);
    expect(rtDrawState.wallDrawOrder.length).toBeLessThan(drawState.wallDrawOrder.length);
  });
});
