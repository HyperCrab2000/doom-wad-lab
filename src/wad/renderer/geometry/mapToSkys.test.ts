import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { WadMap } from '@/wad/interfaces/WadMap';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { getLinkedSkySectors } from '@/wad/renderer/geometry/getLinkedSkySectors';
import { getSectorLineGeometry } from '@/wad/renderer/geometry/getLineDefsBySector';
import { mapToSkys } from '@/wad/renderer/geometry/mapToSkys';
import { sectorLinesToTriangles } from '@/wad/renderer/geometry/sectorLinesToTriangles';
import { Triangle } from '@/wad/interfaces/Triangle';

describe('mapToSkys', () => {
  it('creates sky walls where sky sectors border non-sky sectors at different heights', () => {
    const map = loadE1M1();
    const linked = getLinkedSkySectors(map);
    const sectorTriangles = buildSectorTriangles(map);
    const gl = createMockGl();

    const skys = mapToSkys(gl, map, sectorTriangles, linked);

    const wallSkys = skys.filter((sky) => sky.position.numItems === 4);
    expect(wallSkys.length).toBeGreaterThan(0);
  });

  it('creates sky flats for sectors with F_SKY1 ceilings and floors', () => {
    const map = windowFrameMap();
    const linked = getLinkedSkySectors(map);
    const triangles = squareTriangles();

    const skys = mapToSkys(createMockGl(), map, { 0: triangles, 1: triangles }, linked);

    const flatSkys = skys.filter((sky) => sky.position.numItems > 4);
    expect(flatSkys.length).toBeGreaterThan(0);
    expect(flatSkys.every((sky) => sky.uv.numItems > 0 && sky.indices.numItems > 0)).toBe(true);
  });

  it('returns no flats for sectors without sky textures or triangulation data', () => {
    const map = windowFrameMap();
    const linked = getLinkedSkySectors(map);

    const skys = mapToSkys(createMockGl(), map, { 0: squareTriangles() }, linked);

    expect(skys.filter((sky) => sky.position.numItems > 4)).toHaveLength(0);
  });

  it('skips the reverse side pass on one-sided lines', () => {
    const map = collapsedSkySectorMap();
    const linked = getLinkedSkySectors(map);
    const skys = mapToSkys(createMockGl(), map, { 0: squareTriangles() }, linked);

    expect(skys.length).toBeGreaterThan(0);
  });

  it('emits ceiling and floor flats when a sector has zero height', () => {
    const map = collapsedSkySectorMap();
    const linked = getLinkedSkySectors(map);
    const skys = mapToSkys(createMockGl(), map, { 0: squareTriangles() }, linked);
    const flatSkys = skys.filter((sky) => sky.position.numItems > 4);

    expect(flatSkys.length).toBe(2);
  });

  it('builds sky geometry for real E1M1 outdoor sectors', () => {
    const map = loadE1M1();
    const linked = getLinkedSkySectors(map);
    const outdoorSector = map.SECTORS.findIndex((sector) => sector.ceilingpic === 'F_SKY1');
    expect(outdoorSector).toBeGreaterThanOrEqual(0);

    const triangles = [
      [
        { x: 0, y: 0 },
        { x: 64, y: 0 },
        { x: 64, y: 64 },
      ],
    ];

    const skys = mapToSkys(createMockGl(), map, { [outdoorSector]: triangles }, linked);
    expect(skys.length).toBeGreaterThan(0);
  });
});

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

function buildSectorTriangles(map: WadMap): Record<number, Triangle[]> {
  const linesBySector = getSectorLineGeometry(map);
  const sectorTriangles: Record<number, Triangle[]> = {};

  for (const [key, lines] of Object.entries(linesBySector)) {
    try {
      sectorTriangles[Number(key)] = sectorLinesToTriangles(map, lines);
    } catch {
      // skip malformed sectors
    }
  }

  return sectorTriangles;
}

function collapsedSkySectorMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
    ],
    SECTORS: [{ floorheight: 64, ceilingheight: 64, floorpic: 'F_SKY1', ceilingpic: 'F_SKY1' }],
    SIDEDEFS: [{ sector: 0, xOffset: 0, yOffset: 0, topTexture: '-', bottomTexture: '-', midTexture: '-' }],
    LINEDEFS: [
      {
        v1: 0,
        v2: 1,
        special: 0,
        sidenum: [0, -1],
        flags: windowFrameMap().LINEDEFS[0].flags,
      },
    ],
    THINGS: [],
  } as unknown as WadMap;
}

function windowFrameMap(): WadMap {
  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 128, y: 0 },
    ],
    SECTORS: [
      { floorheight: 0, ceilingheight: 72, floorpic: 'FLOOR0_1', ceilingpic: 'CEIL3_5' },
      { floorheight: -56, ceilingheight: 216, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1' },
    ],
    SIDEDEFS: [
      { sector: 0, xOffset: 0, yOffset: 0, topTexture: '-', bottomTexture: '-', midTexture: '-' },
      { sector: 1, xOffset: 0, yOffset: 0, topTexture: '-', bottomTexture: '-', midTexture: '-' },
    ],
    LINEDEFS: [
      {
        v1: 0,
        v2: 1,
        special: 0,
        sidenum: [0, 1],
        flags: {
          impassible: false,
          blockMonsters: false,
          twoSided: true,
          upperUnpegged: false,
          lowerUnpegged: false,
          secret: false,
          blockSound: false,
          notOnMap: false,
          alreadyOnMap: false,
        },
      },
    ],
    THINGS: [],
  } as unknown as WadMap;
}

function squareTriangles() {
  return [
    [
      { x: 0, y: 0 },
      { x: 128, y: 0 },
      { x: 128, y: 128 },
    ],
    [
      { x: 0, y: 0 },
      { x: 128, y: 128 },
      { x: 0, y: 128 },
    ],
  ];
}

function createMockGl(): WebGLRenderingContext & {
  getBufferData: (buffer: WebGLBuffer) => ArrayBuffer | null;
} {
  let nextId = 1;
  let bound: WebGLBuffer | null = null;
  const latest = new Map<WebGLBuffer, ArrayBuffer>();

  const gl = {
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    createBuffer: () => ({ id: nextId++ }) as WebGLBuffer,
    bindBuffer: (_target: number, buffer: WebGLBuffer | null) => {
      bound = buffer;
    },
    bufferData: (_target: number, data: ArrayBufferView) => {
      if (!bound) return;
      latest.set(bound, data.slice().buffer);
    },
    getBufferData: (buffer: WebGLBuffer) => latest.get(buffer) ?? null,
  };
  return gl as unknown as WebGLRenderingContext & {
    getBufferData: (buffer: WebGLBuffer) => ArrayBuffer | null;
  };
}
