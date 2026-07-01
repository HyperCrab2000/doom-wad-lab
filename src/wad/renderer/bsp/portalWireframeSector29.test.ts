import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { buildPortalVisibleSectors, buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';

function loadE1M1() {
  const buf = fs.readFileSync(path.resolve(process.cwd(), 'public/wads/DOOM.WAD'));
  return loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)).maps.E1M1;
}

describe('E1M1 sector 29 portal wireframe', () => {
  it('does not include spawn outdoor or BSP x-ray flats from raised platform', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const sv = buildSectorVisibilityIndex(map)!;
    const b = sv.sectorBounds[29]!;
    const x = (b.minX + b.maxX) / 2;
    const y = (b.minY + b.maxY) / 2;

    const portal = buildPortalVisibleSectors(sv, map, x, y, 29);
    expect(portal.has(0)).toBe(false);
    expect(portal.has(1)).toBe(false);

    const state = buildGzdoomDrawState({
      map,
      buffers: {
        bspRenderIndex: index,
        sectorVisibility: sv,
        subsectorFlats: mapToSubsectorFlats(map, index),
        sectorTriangles: {},
        triangleHash: null,
        wallRangesByLine: [],
        wallRangesByLineAndSide: [],
      } as never,
      viewX: x,
      viewY: y,
      viewYaw: 0,
      cameraPos: [x, 41, -y],
    })!;

    const meshSectors = new Set(
      state.flatSubsectorOrder.map((sub) => index.subsectorToSector[sub] ?? -1)
    );
    expect(meshSectors.has(0)).toBe(false);
    expect(meshSectors.has(70)).toBe(false);
    expect(state.wallDrawOrder.length).toBeLessThan(state.bspWallDrawOrder.length / 2);
    expect(state.flatSubsectorOrder.length).toBeLessThan(state.bspFlatSubsectorOrder.length / 2);
  });
});
