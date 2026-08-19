import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import {
  buildGzdoomDrawState,
  sectorsFromFlatSubsectorOrder,
  sectorsFromWallDrawOrder,
} from '@/wad/renderer/bsp/gzdoomDrawState';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

function drawAt(
  map: ReturnType<typeof loadE1M1>,
  x: number,
  y: number,
  viewYaw: number
) {
  const index = buildBspRenderIndex(map)!;
  const sv = buildSectorVisibilityIndex(map)!;
  return buildGzdoomDrawState({
    map,
    buffers: {
      bspRenderIndex: index,
      sectorTriangles: {},
      triangleHash: null,
      sectorVisibility: sv,
      subsectorFlats: mapToSubsectorFlats(map, index),
    } as never,
    viewX: x,
    viewY: y,
    viewYaw,
    cameraPos: [x, 41, -y],
  })!;
}

describe('E1M1 spawn stair leak regression', () => {
  it('blocks pass-wall stair flats at spawn when BSP flats lack matching walls', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const player = map.THINGS.find((t) => t.type === 1)!;
    const state = drawAt(map, player.x, player.y, 0);
    const flatSectors = sectorsFromFlatSubsectorOrder(index, state.flatSubsectorOrder);
    expect(state.cameraSectorIndex).toBe(29);
    expect(flatSectors.has(3)).toBe(false);
  });

  it('excludes mesh-only courtyard sky 42 flat at spawn (flat-anchor required)', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const player = map.THINGS.find((t) => t.type === 1)!;
    const yaw = (player.angle * Math.PI) / 180;
    const state = drawAt(map, player.x, player.y, yaw);
    const flatSectors = sectorsFromFlatSubsectorOrder(index, state.flatSubsectorOrder);
    expect(flatSectors.has(42)).toBe(false);
  });

  it('excludes outdoor nukage sector 0 flat at default spawn yaw', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const player = map.THINGS.find((t) => t.type === 1)!;
    const yaw = (player.angle * Math.PI) / 180;
    const state = drawAt(map, player.x, player.y, yaw);
    const flatSectors = sectorsFromFlatSubsectorOrder(index, state.flatSubsectorOrder);
    const wallSectors = sectorsFromWallDrawOrder(map, state.wallDrawOrder);
    expect(flatSectors.has(0)).toBe(false);
    expect(wallSectors.has(0)).toBe(false);
  });

  it('excludes pass-wall stair sector 3 flat at default spawn yaw', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const player = map.THINGS.find((t) => t.type === 1)!;
    const yaw = (player.angle * Math.PI) / 180;
    const state = drawAt(map, player.x, player.y, yaw);
    const flatSectors = sectorsFromFlatSubsectorOrder(index, state.flatSubsectorOrder);
    expect(flatSectors.has(3)).toBe(false);
  });

  it('excludes deep outdoor sky sector 1 floor flat at default spawn yaw', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const player = map.THINGS.find((t) => t.type === 1)!;
    const yaw = (player.angle * Math.PI) / 180;
    const state = drawAt(map, player.x, player.y, yaw);
    const flatSectors = sectorsFromFlatSubsectorOrder(index, state.flatSubsectorOrder);
    expect(flatSectors.has(1)).toBe(false);
    expect(flatSectors.has(42)).toBe(false);
  });

  it('keeps courtyard sky 42 when facing windows from raised room 43', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const state = drawAt(map, -192, -3128, -Math.PI / 2);
    const flatSectors = sectorsFromFlatSubsectorOrder(index, state.flatSubsectorOrder);
    expect(flatSectors.has(42)).toBe(true);
  });

  it('draws stair sector 3 from sector 31 when facing the staircase', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const sv = buildSectorVisibilityIndex(map)!;
    const b31 = sv.sectorBounds[31]!;
    const b3 = sv.sectorBounds[3]!;
    const x = (b31.minX + b31.maxX) / 2;
    const y = (b31.minY + b31.maxY) / 2;
    const yaw = Math.atan2((b3.minY + b3.maxY) / 2 - y, (b3.minX + b3.maxX) / 2 - x);
    const state = drawAt(map, x, y, yaw);
    const flatSectors = sectorsFromFlatSubsectorOrder(index, state.flatSubsectorOrder);
    expect(state.cameraSectorIndex).toBe(31);
    expect(flatSectors.has(3)).toBe(true);
  });
});
