import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mat4 } from 'gl-matrix';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildBspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';
import { traceClassicBsp } from '@/wad/renderer/bsp/classicBspTrace';
import {
  doomAngleToYaw,
  getViewAnglesFromViewMatrix,
  projectDoomOffsetToAutomapCanvas,
  writePlayerViewMatrix,
} from '@/wad/renderer/controls/playerView';
import { cycleAutomapCheat, drawAutomap } from './automap';

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

describe('cycleAutomapCheat', () => {
  it('cycles 0 → 1 → 2 → 0', () => {
    expect(cycleAutomapCheat(0)).toBe(1);
    expect(cycleAutomapCheat(1)).toBe(2);
    expect(cycleAutomapCheat(2)).toBe(0);
  });
});

describe('automap facing parity', () => {
  it('marks mostly forward BSP segs visible at E1M1 spawn for the matching view yaw', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const start = map.THINGS.find((thing) => thing.type === 1)!;
    const yaw = doomAngleToYaw(start.angle);
    const forwardX = Math.cos(yaw);
    const forwardY = Math.sin(yaw);

    const visible = buildBspVisibleSet({
      map,
      index,
      viewX: start.x,
      viewY: start.y,
      viewYaw: yaw,
    });
    const trace = traceClassicBsp({
      map,
      index,
      viewX: start.x,
      viewY: start.y,
      viewYaw: yaw,
    });

    let forwardVisible = 0;
    let rearVisible = 0;
    for (const entry of trace.segByIndex.values()) {
      if (entry.reason !== 'visible') continue;
      const seg = map.SEGS[entry.segIndex];
      if (!seg) continue;
      const v1 = map.VERTEXES[seg.v1];
      const v2 = map.VERTEXES[seg.v2];
      if (!v1 || !v2) continue;
      const mx = (v1.x + v2.x) * 0.5;
      const my = (v1.y + v2.y) * 0.5;
      const dot = (mx - start.x) * forwardX + (my - start.y) * forwardY;
      if (dot >= 0) forwardVisible++;
      else rearVisible++;
    }

    expect(forwardVisible).toBeGreaterThan(rearVisible);
    expect(visible.wallDrawOrder.length).toBeGreaterThan(0);
    expect(trace.segByIndex.size).toBeGreaterThan(0);
  });
});
