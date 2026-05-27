import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FloorMoverSystem } from '@/wad/game/floorMoverSystem';
import { findHighestFloorSurrounding } from '@/wad/game/floorSurrounding';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';

describe('floorSurrounding', () => {
  it('does not seed HEF from the sector own floor height', () => {
    const map = {
      VERTEXES: [
        { x: 0, y: 0 },
        { x: 64, y: 0 },
        { x: 64, y: 64 },
        { x: 0, y: 64 },
      ],
      LINEDEFS: [
        { v1: 0, v2: 1, sidenum: [0, 1], special: 0, tag: 0, flags: { twoSided: true } },
        { v1: 1, v2: 2, sidenum: [2, 3], special: 0, tag: 0, flags: { twoSided: true } },
        { v1: 2, v2: 3, sidenum: [4, 5], special: 0, tag: 0, flags: { twoSided: true } },
        { v1: 3, v2: 0, sidenum: [6, 7], special: 0, tag: 0, flags: { twoSided: true } },
      ],
      SIDEDEFS: [
        { sector: 0, middleTexture: '-' },
        { sector: 1, middleTexture: '-' },
        { sector: 0, middleTexture: '-' },
        { sector: 1, middleTexture: '-' },
        { sector: 0, middleTexture: '-' },
        { sector: 1, middleTexture: '-' },
        { sector: 0, middleTexture: '-' },
        { sector: 1, middleTexture: '-' },
      ],
      SECTORS: [
        { floorheight: 112, ceilingheight: 128, tag: 3 },
        { floorheight: 48, ceilingheight: 128, tag: 0 },
      ],
    } as unknown as import('@/wad/interfaces/WadMap').WadMap;

    expect(findHighestFloorSurrounding(map, 0)).toBe(48);
  });
});

describe.skipIf(!fs.existsSync(path.resolve(process.cwd(), 'public/wads/DOOM.WAD')))(
  'E1M1 stock floor specials',
  () => {
    function loadE1M1() {
      const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
      const buf = fs.readFileSync(wadPath);
      return loadWadFromArrayBuffer(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      ).maps.E1M1;
    }

    it('lowers tagged sector 5 for walk line 471 (floor to lowest)', () => {
      const map = loadE1M1();
      const system = new FloorMoverSystem(map);
      const sector = map.SECTORS[14];
      expect(sector.tag).toBe(5);
      expect(system.tryWalkLine(471, map.LINEDEFS[471]).triggered).toBe(true);
      for (let i = 0; i < 80 && system.getActiveMoverCount() > 0; i++) {
        system.tick(0.05);
      }
      expect(sector.floorheight).toBeLessThan(32);
    });

    it('does not raise sector for turbo lower when already at HEF (line 304)', () => {
      const map = loadE1M1();
      const system = new FloorMoverSystem(map);
      const sector = map.SECTORS[55];
      const before = sector.floorheight;
      const hef = findHighestFloorSurrounding(map, 55);
      expect(system.tryWalkLine(304, map.LINEDEFS[304]).triggered).toBe(
        Math.abs(hef - before) > 0.5
      );
      for (let i = 0; i < 80 && system.getActiveMoverCount() > 0; i++) {
        system.tick(0.05);
      }
      if (Math.abs(hef - before) <= 0.5) {
        expect(sector.floorheight).toBe(before);
      }
    });
  }
);
