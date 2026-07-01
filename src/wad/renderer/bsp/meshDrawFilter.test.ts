import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

function buffers(map: ReturnType<typeof loadE1M1>) {
  const index = buildBspRenderIndex(map)!;
  const sv = buildSectorVisibilityIndex(map)!;
  return {
    bspRenderIndex: index,
    sectorVisibility: sv,
    subsectorFlats: mapToSubsectorFlats(map, index),
    sectorTriangles: {},
    triangleHash: null,
    wallRangesByLine: [],
    wallRangesByLineAndSide: [],
  } as never;
}

describe('mesh draw filter regressions', () => {
  it('sector 43 north: textured draw excludes spawn/hangar x-ray', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const state = buildGzdoomDrawState({
      map,
      buffers: buffers(map),
      viewX: -192,
      viewY: -3128,
      viewYaw: -Math.PI / 2,
      cameraPos: [-192, 41, 3128],
    })!;
    const flatSectors = new Set(
      state.flatSubsectorOrder.map((sub) => index.subsectorToSector[sub] ?? -1)
    );
    expect(flatSectors.has(0)).toBe(false);
    expect(flatSectors.has(70)).toBe(false);
    expect(flatSectors.has(42)).toBe(true);
    expect(flatSectors.size).toBeLessThan(15);
  });

  it('stair sector 3 facing courtyard keeps mesh-filtered sky 42', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const sv = buildSectorVisibilityIndex(map)!;
    const b3 = sv.sectorBounds[3]!;
    const b42 = sv.sectorBounds[42]!;
    const x = (b3.minX + b3.maxX) / 2;
    const y = (b3.minY + b3.maxY) / 2;
    const yaw = Math.atan2((b42.minY + b42.maxY) / 2 - y, (b42.minX + b42.maxX) / 2 - x);
    const state = buildGzdoomDrawState({
      map,
      buffers: buffers(map),
      viewX: x,
      viewY: y,
      viewYaw: yaw,
      cameraPos: [x, 41, -y],
    })!;
    const flatSectors = new Set(
      state.flatSubsectorOrder.map((sub) => index.subsectorToSector[sub] ?? -1)
    );
    expect(state.cameraSectorIndex).toBe(3);
    expect(flatSectors.has(42)).toBe(true);
    expect(flatSectors.has(0)).toBe(false);
    expect(flatSectors.has(70)).toBe(false);
  });

  it('E1M1 spawn room: portal mesh draw excludes pass-wall stair flats at multiple standpoints', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const player = map.THINGS.find((t) => t.type === 1)!;
    const offsets = [
      [0, 0],
      [32, 0],
      [-32, 0],
    ] as const;
    for (const [dx, dy] of offsets) {
      const x = player.x + dx;
      const y = player.y + dy;
      const state = buildGzdoomDrawState({
        map,
        buffers: buffers(map),
        viewX: x,
        viewY: y,
        viewYaw: 0,
        cameraPos: [x, 41, -y],
      })!;
      const flatSectors = new Set(
        state.flatSubsectorOrder.map((sub) => index.subsectorToSector[sub] ?? -1)
      );
      expect(flatSectors.has(3), `pass-wall stairs at offset ${dx},${dy}`).toBe(false);
    }
  });

  it('pool sector 5 facing courtyard does not x-ray entire map flats', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const sv = buildSectorVisibilityIndex(map)!;
    const b5 = sv.sectorBounds[5]!;
    const b42 = sv.sectorBounds[42]!;
    const x = (b5.minX + b5.maxX) / 2;
    const y = (b5.minY + b5.maxY) / 2;
    const yaw = Math.atan2((b42.minY + b42.maxY) / 2 - y, (b42.minX + b42.maxX) / 2 - x);
    const state = buildGzdoomDrawState({
      map,
      buffers: buffers(map),
      viewX: x,
      viewY: y,
      viewYaw: yaw,
      cameraPos: [x, 41, -y],
    })!;
    expect(state.flatSubsectorOrder.length).toBeLessThan(30);
    expect(state.visibleSectors.has(70)).toBe(false);
  });
});
