import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { WadMap } from '@/wad/interfaces/WadMap';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { getLinkedSkySectors } from '@/wad/renderer/geometry/getLinkedSkySectors';

describe('getLinkedSkySectors', () => {
  it('links adjacent sky-ceiling sectors to the highest ceiling in the group', () => {
    const map = connectedSkyCeilingMap();
    const linked = getLinkedSkySectors(map);

    expect(linked.ceilings[0].height).toBe(256);
    expect(linked.ceilings[1].height).toBe(256);
    expect(linked.ceilings[0].sectorIndex).toBe(linked.ceilings[1].sectorIndex);
  });

  it('links adjacent sky-floor sectors to the lowest floor in the group', () => {
    const map = connectedSkyFloorMap();
    const linked = getLinkedSkySectors(map);

    expect(linked.floors[0].height).toBe(-32);
    expect(linked.floors[1].height).toBe(-32);
    expect(linked.floors[0].sectorIndex).toBe(linked.floors[1].sectorIndex);
  });

  it('keeps unconnected sky sectors in separate groups', () => {
    const map = disconnectedSkyMap();
    const linked = getLinkedSkySectors(map);

    expect(linked.ceilings[0].sectorIndex).not.toBe(linked.ceilings[1].sectorIndex);
    expect(linked.ceilings[0].height).toBe(128);
    expect(linked.ceilings[1].height).toBe(192);
  });

  it('assigns linked heights for real E1M1 sky sectors', () => {
    const map = loadE1M1();
    const linked = getLinkedSkySectors(map);
    const skySectorIndices = map.SECTORS
      .map((sector, index) => (sector.ceilingpic === 'F_SKY1' || sector.floorpic === 'F_SKY1' ? index : -1))
      .filter((index) => index >= 0);

    expect(skySectorIndices.length).toBeGreaterThan(0);
    for (const index of skySectorIndices) {
      expect(linked.ceilings[index] ?? linked.floors[index]).toBeDefined();
    }
  });
});

function connectedSkyCeilingMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    SECTORS: [
      { floorheight: 0, ceilingheight: 128, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1' },
      { floorheight: 0, ceilingheight: 256, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1' },
    ],
    SIDEDEFS: [{ sector: 0 }, { sector: 1 }],
    LINEDEFS: [{ v1: 0, v2: 1, sidenum: [0, 1] }],
  } as unknown as WadMap;
}

function connectedSkyFloorMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    SECTORS: [
      { floorheight: 0, ceilingheight: 128, floorpic: 'F_SKY1', ceilingpic: 'CEIL1_1' },
      { floorheight: -32, ceilingheight: 128, floorpic: 'F_SKY1', ceilingpic: 'CEIL1_1' },
    ],
    SIDEDEFS: [{ sector: 0 }, { sector: 1 }],
    LINEDEFS: [{ v1: 0, v2: 1, sidenum: [0, 1] }],
  } as unknown as WadMap;
}

function disconnectedSkyMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 128, y: 0 },
      { x: 192, y: 0 },
    ],
    SECTORS: [
      { floorheight: 0, ceilingheight: 128, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1' },
      { floorheight: 0, ceilingheight: 192, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1' },
    ],
    SIDEDEFS: [{ sector: 0 }, { sector: 1 }],
    LINEDEFS: [
      { v1: 0, v2: 1, sidenum: [0, -1] },
      { v1: 2, v2: 3, sidenum: [1, -1] },
    ],
  } as unknown as WadMap;
}

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}
