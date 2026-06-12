import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildBspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';
import { traceClassicBsp } from '@/wad/renderer/bsp/classicBspTrace';

describe('traceClassicBsp', () => {
  it('matches buildBspVisibleSet wall draw order at E1M1 spawn', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;
    const viewYaw = (playerStart.angle * Math.PI) / 180;

    const params = {
      map,
      index,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw,
    };

    const visible = buildBspVisibleSet(params);
    const trace = traceClassicBsp(params);

    expect(trace.cameraSubsector).toBe(visible.cameraSubsector);
    expect(trace.cameraSectorIndex).toBe(visible.cameraSectorIndex);
    expect(trace.wallDrawOrder.length).toBe(visible.wallDrawOrder.length);
    expect(trace.stats.wallDrawEntries).toBe(visible.wallDrawOrder.length);

    for (let i = 0; i < visible.wallDrawOrder.length; i++) {
      expect(trace.wallDrawOrder[i]).toEqual(visible.wallDrawOrder[i]);
    }

    expect(trace.stats.visible + trace.stats.validcount).toBeGreaterThan(0);
    expect(trace.stats.notReached).toBeGreaterThan(0);
  });
});

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}
