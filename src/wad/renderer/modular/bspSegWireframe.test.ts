import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { appendWallSegWireframe } from '@/wad/renderer/modular/bspSegWireframe';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

describe('bspSegWireframe draw lists', () => {
  it('includes courtyard wall entries through E1M1 window room 43 facing south', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const sv = buildSectorVisibilityIndex(map)!;
    const subsectorFlats = mapToSubsectorFlats(map, index);
    const buffers = {
      bspRenderIndex: index,
      sectorVisibility: sv,
      subsectorFlats,
      sectorTriangles: {},
      triangleHash: null,
      wallRangesByLine: [],
      wallRangesByLineAndSide: [],
    } as never;

    const viewX = -192;
    const viewY = -3128;
    const viewYaw = Math.PI;
    const drawState = buildGzdoomDrawState({
      map,
      buffers,
      viewX,
      viewY,
      viewYaw,
      cameraPos: [viewX, 41, -viewY],
    })!;

    const positions: number[] = [];
    const indices: number[] = [];
    let courtyardWalls = 0;
    for (const entry of drawState.wallDrawOrder) {
      const sec = map.SIDEDEFS[entry.sideDefIndex]?.sector ?? -1;
      if (sec !== 41 && sec !== 42) continue;
      courtyardWalls++;
      const line = map.LINEDEFS[entry.lineIndex]!;
      const v1 = map.VERTEXES[line.v1]!;
      const v2 = map.VERTEXES[line.v2]!;
      const sector = map.SECTORS[sec]!;
      appendWallSegWireframe(positions, indices, v1.x, v1.y, v2.x, v2.y, sector.floorheight, sector.ceilingheight);
    }

    expect(drawState.flatSubsectorOrder.some((ss) => index.subsectorToSector[ss] === 42)).toBe(true);
    expect(drawState.bspFlatSubsectorOrder.some((ss) => index.subsectorToSector[ss] === 42)).toBe(true);
    expect(courtyardWalls).toBeGreaterThan(0);
    expect(indices.length).toBeGreaterThan(0);
  });

  it('portal mode at sector 3 omits courtyard flats that production BSP keeps', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const sv = buildSectorVisibilityIndex(map)!;
    const subsectorFlats = mapToSubsectorFlats(map, index);
    const buffers = {
      bspRenderIndex: index,
      sectorVisibility: sv,
      subsectorFlats,
      sectorTriangles: {},
      triangleHash: null,
      wallRangesByLine: [],
      wallRangesByLineAndSide: [],
    } as never;

    const b3 = sv.sectorBounds[3]!;
    const viewX = (b3.minX + b3.maxX) / 2;
    const viewY = (b3.minY + b3.maxY) / 2;
    const drawState = buildGzdoomDrawState({
      map,
      buffers,
      viewX,
      viewY,
      viewYaw: Math.PI,
      cameraPos: [viewX, 41, -viewY],
    })!;

    const productionFlatSectors = new Set(
      drawState.bspFlatSubsectorOrder.map((sub) => index.subsectorToSector[sub] ?? -1)
    );
    const meshFlatSectors = new Set(
      drawState.flatSubsectorOrder.map((sub) => index.subsectorToSector[sub] ?? -1)
    );
    const portalFlatSectors = new Set(
      drawState.portalFlatSubsectorOrder.map((sub) => index.subsectorToSector[sub] ?? -1)
    );

    expect(productionFlatSectors.has(42)).toBe(true);
    expect(meshFlatSectors.has(42)).toBe(true);
    expect(portalFlatSectors.has(42)).toBe(false);
    expect(drawState.bspWallDrawOrder.length).toBeGreaterThan(drawState.wallDrawOrder.length);
    expect(drawState.bspFlatSubsectorOrder.length).toBeGreaterThan(drawState.flatSubsectorOrder.length);
  });
});
