import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import {
  buildGzdoomDrawState,
  filterBspSectorsByPortalGraph,
} from '@/wad/renderer/bsp/gzdoomDrawState';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';

describe('buildGzdoomDrawState', () => {
  it('builds BSP-ordered wall and sector flat draw lists at E1M1 player start', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;

    const state = buildGzdoomDrawState({
      map,
      buffers: {
        bspRenderIndex: index,
        sectorTriangles: {},
        triangleHash: null,
        sectorVisibility: null,
        wallRangesByLine: [],
        flats: [],
        subsectorFlats: [],
      } as never,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw: (playerStart.angle * Math.PI) / 180,
      cameraPos: [playerStart.x, 41, -playerStart.y],
    });

    expect(state).not.toBeNull();
    expect(state!.wallDrawOrder.length).toBeGreaterThanOrEqual(8);
    expect(state!.flatSubsectorOrder.length).toBeGreaterThan(0);
    expect(state!.flatSectorOrder).toContain(state!.cameraSectorIndex);
  });

  it('does not include distant courtyard interior from indoor spawn through BSP alone', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;

    const state = buildGzdoomDrawState({
      map,
      buffers: {
        bspRenderIndex: index,
        sectorTriangles: {},
        triangleHash: null,
        sectorVisibility: null,
        wallRangesByLine: [],
        flats: [],
        subsectorFlats: [],
      } as never,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw: (playerStart.angle * Math.PI) / 180,
      cameraPos: [playerStart.x, 41, -playerStart.y],
    });

    expect(state!.visibleSectors.has(70)).toBe(false);
  });

  it('excludes sky sectors from different islands but trusts BSP for indoor sectors', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const sectorVisibility = buildSectorVisibilityIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;

    const state = buildGzdoomDrawState({
      map,
      buffers: {
        bspRenderIndex: index,
        sectorTriangles: {},
        triangleHash: null,
        sectorVisibility,
        wallRangesByLine: [],
        flats: [],
        subsectorFlats: [],
      } as never,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw: (playerStart.angle * Math.PI) / 180,
      cameraPos: [playerStart.x, 41, -playerStart.y],
    });

    // Sky sectors from different islands are excluded (hangar vs courtyard isolation).
    expect(state!.visibleSectors.has(42)).toBe(false); // courtyard sky — different island
    // Sector 0 (hangar sky, same island as spawn path) should be visible.
    expect(state!.visibleSectors.has(0)).toBe(true);
    // Indoor sectors: BSP is trusted, depth buffer handles occlusion at render time.
    // Sector 70 is far away and typically not reached by BSP.
    expect(state!.visibleSectors.has(70)).toBe(false);
  });
});

describe('filterBspSectorsByPortalGraph', () => {
  it('includes indoor BSP sectors and same-island sky sectors for indoor camera', () => {
    const map = loadE1M1();
    const index = buildSectorVisibilityIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;
    const cameraSector = 29;

    const filtered = filterBspSectorsByPortalGraph(
      map,
      index,
      playerStart.x,
      playerStart.y,
      cameraSector,
      new Set([0, 1, 2, 29])
    );

    // Camera sector always included.
    expect(filtered.has(29)).toBe(true);
    // Sector 0 (hangar sky) — in same portal island → included.
    expect(filtered.has(0)).toBe(true);
    // Sector 2 (indoor degenerate) — BSP trusted for indoor → included.
    expect(filtered.has(2)).toBe(true);
  });
});

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}
