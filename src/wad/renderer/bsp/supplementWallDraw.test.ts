import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildBspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import {
  buildSupplementedWallDrawOrder,
  isVanillaBackface,
  supplementTwoSidedClipWallsFromTrace,
  supplementWallDrawFromTrace,
  supplementWallsFromVisibleSubsectors,
} from '@/wad/renderer/bsp/supplementWallDraw';

describe('supplementWallDrawFromTrace', () => {
  it('adds clip-blocked one-sided walls in visited subsectors (E1M1 pillar windows)', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;
    const viewYaw = (playerStart.angle * Math.PI) / 180;

    const bsp = buildBspVisibleSet({
      map,
      index,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw,
    });

    expect(bsp.visibleLineIndices.has(37)).toBe(true);
    expect(bsp.visibleLineIndices.has(47)).toBe(true);

    const supplemented = supplementWallDrawFromTrace(
      map,
      index,
      playerStart.x,
      playerStart.y,
      viewYaw,
      bsp.wallDrawOrder,
      bsp.visibleSubsectors
    );

    expect(supplemented.some((entry) => entry.lineIndex === 37)).toBe(true);
    expect(supplemented.some((entry) => entry.lineIndex === 47)).toBe(true);
    expect(supplemented.length).toBeGreaterThanOrEqual(bsp.wallDrawOrder.length);
  });

  it('adds screen-gated two-sided clip walls outside the flat mesh pool (E1M1 east)', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;
    const viewYaw = (playerStart.angle * Math.PI) / 180;

    const bsp = buildBspVisibleSet({
      map,
      index,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw,
    });

    const supplemented = supplementTwoSidedClipWallsFromTrace(
      map,
      index,
      playerStart.x,
      playerStart.y,
      viewYaw,
      41,
      bsp.wallDrawOrder,
      bsp.visibleSubsectors,
      new Set([29, 24]),
      { minPfX: 280, minPfY: 84, maxPfY: 126 },
    );

    expect(supplemented.lineIndices.has(409)).toBe(true);
    expect(supplemented.lineIndices.has(413)).toBe(true);
    expect(supplemented.lineIndices.size).toBeLessThan(120);
  });

  it('draws E1M1 line 7 when BSP or supplement includes the player-start subsector', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;
    const viewYaw = (playerStart.angle * Math.PI) / 180;

    const state = buildGzdoomDrawState({
      map,
      buffers: { bspRenderIndex: index } as never,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw,
      cameraPos: [playerStart.x, 0, -playerStart.y],
    });

    const lines = new Set(state?.wallDrawOrder.map((entry) => entry.lineIndex));
    expect(lines.size).toBeGreaterThanOrEqual(8);
    expect(lines.has(37)).toBe(true);
    expect(lines.has(47)).toBe(true);
    expect(lines.has(53)).toBe(true);
  });

  it('supplementWallsFromVisibleSubsectors adds all linedefs in visited subsectors', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;
    const viewYaw = (playerStart.angle * Math.PI) / 180;

    const bsp = buildBspVisibleSet({
      map,
      index,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw,
    });

    const supplemented = buildSupplementedWallDrawOrder(
      map,
      index,
      playerStart.x,
      playerStart.y,
      viewYaw,
      bsp.wallDrawOrder,
      bsp.visibleSubsectors,
      bsp.flatSubsectorOrder
    );

    expect(supplemented.length).toBeGreaterThanOrEqual(bsp.wallDrawOrder.length);
    expect(supplemented.length).toBeGreaterThan(0);
  });

  it('does not toggle E1M1 line 454 when the camera nudges across a subsector lip', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;

    function has454(viewY: number) {
      const state = buildGzdoomDrawState({
        map,
        buffers: { bspRenderIndex: index } as never,
        viewX: -280,
        viewY,
        viewYaw: 0,
        cameraPos: [-280, 41, -viewY],
      });
      return state!.wallDrawOrder.some((entry) => entry.lineIndex === 454);
    }

    expect(has454(-3264)).toBe(has454(-3256));
  });
});

describe('isVanillaBackface', () => {
  it('matches Doom angle ordering for E1M1 line 7 at the player start', () => {
    const map = loadE1M1();
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;
    const line = map.LINEDEFS[7];
    const v1 = map.VERTEXES[line.v1];
    const v2 = map.VERTEXES[line.v2];

    expect(
      isVanillaBackface(playerStart.x, playerStart.y, v1.x, v1.y, v2.x, v2.y)
    ).toBe(false);
  });
});

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}
