import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import {
  buildGzdoomDrawState,
  filterBspSectorsByPortalGraph,
} from '@/wad/renderer/bsp/gzdoomDrawState';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
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
    expect(state!.bspFlatSubsectorOrder.length).toBeGreaterThanOrEqual(state!.flatSubsectorOrder.length);
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

  it('intersects BSP with portal connectivity at spawn (courtyard sky, no distant indoor leaks)', () => {
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
        subsectorFlats: mapToSubsectorFlats(map, index),
      } as never,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw: (playerStart.angle * Math.PI) / 180,
      cameraPos: [playerStart.x, 41, -playerStart.y],
    });

    expect(state!.cameraSectorIndex).toBe(29);
    expect(state!.visibleSectors.has(42)).toBe(true);
    expect(state!.visibleSectors.has(0)).toBe(false);
    expect(state!.visibleSectors.has(41)).toBe(false);
    expect(state!.visibleSectors.has(43)).toBe(false);
    expect(state!.visibleSectors.has(70)).toBe(false);

    const passWall = buildGzdoomDrawState({
      map,
      buffers: {
        bspRenderIndex: index,
        sectorTriangles: {},
        triangleHash: null,
        sectorVisibility,
        wallRangesByLine: [],
        flats: [],
        subsectorFlats: mapToSubsectorFlats(map, index),
      } as never,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw: 0,
      cameraPos: [playerStart.x, 41, -playerStart.y],
    })!;
    expect(passWall!.visibleSectors.has(3)).toBe(false);
  });

  it('production subsector flats follow BSP DoSubsector visits at E1M1 window room', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const sectorVisibility = buildSectorVisibilityIndex(map)!;
    const subsectorFlats = mapToSubsectorFlats(map, index);

    const state = buildGzdoomDrawState({
      map,
      buffers: {
        bspRenderIndex: index,
        sectorTriangles: {},
        triangleHash: null,
        sectorVisibility,
        wallRangesByLine: [],
        flats: [],
        subsectorFlats,
      } as never,
      viewX: -192,
      viewY: -3128,
      viewYaw: Math.PI,
      cameraPos: [-192, 41, 3128],
    })!;

    expect(state.flatDrawMode).toBe('subsector-bsp');
    expect(state.cameraSectorIndex).toBe(43);
    expect(state.visibleSectors.has(42)).toBe(true);
    expect(state.visibleSectors.has(43)).toBe(true);
    expect(state.visibleSectors.has(0)).toBe(false);
    expect(state.visibleSectors.has(70)).toBe(false);
  });

  it('sees courtyard flats from E1M1 window room (legacy sector mesh + portal)', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const sectorVisibility = buildSectorVisibilityIndex(map)!;

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
      viewX: -192,
      viewY: -3128,
      viewYaw: Math.PI,
      cameraPos: [-192, 41, 3128],
    })!;

    expect(state.cameraSectorIndex).toBe(43);
    expect(state.visibleSectors.has(42)).toBe(true);
    expect(state.visibleSectors.has(43)).toBe(true);
    expect(state.visibleSectors.has(0)).toBe(false);
    expect(state.visibleSectors.has(70)).toBe(false);
  });

  it('does not draw distant indoor sectors from the courtyard at any common yaw', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const sectorVisibility = buildSectorVisibilityIndex(map)!;
    const x = -2624;
    const y = -2848;

    for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
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
        viewX: x,
        viewY: y,
        viewYaw: (deg * Math.PI) / 180,
        cameraPos: [x, 41, -y],
      })!;

      expect(state.visibleSectors.has(70)).toBe(false);
      expect(state.visibleSectors.has(0)).toBe(false);
    }
  });
});

describe('filterBspSectorsByPortalGraph', () => {
  it('keeps BSP sectors only when portal connectivity allows them', () => {
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
      new Set([0, 1, 2, 29, 43, 70])
    );

    expect(filtered.has(29)).toBe(true);
    expect(filtered.has(0)).toBe(false);
    expect(filtered.has(1)).toBe(false);
    expect(filtered.has(43)).toBe(false);
    expect(filtered.has(70)).toBe(false);
  });
});

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}
