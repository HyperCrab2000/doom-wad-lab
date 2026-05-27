import { describe, expect, it } from 'vitest';
import {
  buildWallRangesByLine,
  sortOpaqueWallsForDraw,
} from '@/wad/renderer/geometry/geometryCache';
import type { WallBuffer } from '@/wad/interfaces/WallBuffer';
import type { WallObject } from '@/wad/interfaces/WallObject';

describe('geometryCache', () => {
  it('builds contiguous wall ranges per linedef', () => {
    const walls: WallObject[] = [
      { lineIndex: 0, position: new Float32Array(), uv: new Float32Array(), normal: new Float32Array(), indices: new Uint16Array(), center: [0, 0, 0] },
      { lineIndex: 0, position: new Float32Array(), uv: new Float32Array(), normal: new Float32Array(), indices: new Uint16Array(), center: [0, 0, 0] },
      { lineIndex: 2, position: new Float32Array(), uv: new Float32Array(), normal: new Float32Array(), indices: new Uint16Array(), center: [0, 0, 0] },
    ];

    const ranges = buildWallRangesByLine(walls, 3);
    expect(ranges[0]).toEqual({ start: 0, count: 2 });
    expect(ranges[1]).toEqual({ start: -1, count: 0 });
    expect(ranges[2]).toEqual({ start: 2, count: 1 });
  });

  it('sorts opaque walls by texture then sector for fewer state changes', () => {
    const walls = [
      { texName: 'B', sectorIndex: 1, lineIndex: 0 },
      { texName: 'A', sectorIndex: 2, lineIndex: 0 },
      { texName: 'A', sectorIndex: 1, lineIndex: 1 },
      { texName: 'A', sectorIndex: 1, lineIndex: 0 },
    ] as WallBuffer[];

    const sorted = sortOpaqueWallsForDraw(walls);
    expect(sorted.map((w) => `${w.texName}:${w.sectorIndex}:${w.lineIndex}`)).toEqual([
      'A:1:0',
      'A:1:1',
      'A:2:0',
      'B:1:0',
    ]);
  });
});
