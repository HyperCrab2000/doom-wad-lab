import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex, resolveLinedefSideForView } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildBspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';

describe('resolveLinedefSideForView', () => {
  it('uses the sidedef for the camera sector when the viewer stands in an adjacent sector', () => {
    const map = loadE1M1();
    const line = map.LINEDEFS[167]!;
    const sector0 = map.SIDEDEFS[line.sidenum[0]].sector;
    const sector1 = map.SIDEDEFS[line.sidenum[1]].sector;

    expect(
      resolveLinedefSideForView(map, 167, 0, 0, sector1, null, line.sidenum[1])
    ).toBe(line.sidenum[1]);
    expect(
      resolveLinedefSideForView(map, 167, 0, 0, sector0, null, line.sidenum[1])
    ).toBe(line.sidenum[0]);
  });

  it('keeps sidedef choice stable while moving near the E1M1 player start', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;
    const unstable = new Set<number>();

    for (let li = 0; li < map.LINEDEFS.length; li++) {
      const line = map.LINEDEFS[li];
      if (line.sidenum[1] < 0) continue;

      const chosen = new Set<number>();
      for (let dx = 0; dx <= 200; dx += 20) {
        for (let dy = 0; dy <= 200; dy += 20) {
          const x = playerStart.x + dx;
          const y = playerStart.y + dy;
          const visible = buildBspVisibleSet({
            map,
            index,
            viewX: x,
            viewY: y,
            viewYaw: Math.PI / 2,
          });
          const entry = visible.wallDrawOrder.find((candidate) => candidate.lineIndex === li);
          if (!entry) continue;
          chosen.add(
            resolveLinedefSideForView(
              map,
              li,
              x,
              y,
              visible.cameraSectorIndex,
              visible.visibleSectors,
              entry.sideDefIndex
            )
          );
        }
      }

      if (chosen.size > 1) unstable.add(li);
    }

    expect(unstable.size).toBe(0);
  });
});

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}
