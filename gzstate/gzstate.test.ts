import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GZSTATE_MAGIC, GZSTATE_VERSION } from './constants';
import { diffGzstate } from './diff';
import { readGzstate } from './gzstateReader';
import { internString, writeGzstate } from './gzstateWriter';
import type { GzstateDocument } from './types';

function sampleDoc(): GzstateDocument {
  const strings: string[] = [];
  return {
    header: {
      magic: GZSTATE_MAGIC,
      version: GZSTATE_VERSION,
      flags: 0,
      headerSize: 64,
      sectionCount: 0,
      sectionDirectoryOffset: 64,
      mapName: 'E1M1',
      engineTag: 'TEST',
    },
    sections: [],
    strings,
    vertices: [
      { x: 0, y: 0 },
      { x: 256, y: 512 },
    ],
    sectors: [
      {
        floorHeight: 0,
        ceilingHeight: 128,
        lightLevel: 192,
        special: 0,
        tag: 0,
        floorTextureIndex: internString(strings, 'FLOOR4_8'),
        ceilingTextureIndex: internString(strings, 'CEIL3_5'),
        flags: 0,
      },
    ],
    sidedefs: [
      {
        textureOffsetX: 0,
        textureOffsetY: 0,
        topTextureIndex: internString(strings, '-'),
        bottomTextureIndex: internString(strings, '-'),
        midTextureIndex: internString(strings, 'STARTAN3'),
        sectorIndex: 0,
      },
    ],
    linedefs: [
      {
        vertex1: 0,
        vertex2: 1,
        flags: 1,
        flags2: 0,
        special: 0,
        side0: 0,
        side1: 0xffff,
        tag: 0,
        activation: 0,
        args: [0, 0, 0, 0, 0],
      },
    ],
    segs: [{ vertex1: 0, vertex2: 1, angle: 0, linedef: 0, side: 0, offset: 0 }],
    subsectors: [{ numSegs: 1, firstSeg: 0, sectorIndex: 0, flags: 0 }],
    nodes: [
      {
        x: 128,
        y: 256,
        dx: 256,
        dy: 0,
        bbox: Int16Array.from([0, 512, 0, 512, 0, 512, 0, 512]),
        child0: 0x80000000,
        child1: 0x80000000,
      },
    ],
    things: [{ x: 100, y: 200, z: 0, angle: 90, type: 1, flags: 7, tid: 0 }],
    lumpCatalog: [],
    textureDefs: [],
    flatNames: [],
    spriteNames: [],
    musicNames: [],
    soundNames: [],
    pnames: [],
    patchRasters: [],
    flatRasters: [],
    spriteRasters: [],
    textureRasters: [],
  };
}

describe('GZSTATE v1', () => {
  it('round-trips through writer and reader', () => {
    const original = sampleDoc();
    const buffer = writeGzstate(original);
    const decoded = readGzstate(buffer);
    expect(decoded.header.mapName).toBe('E1M1');
    expect(decoded.vertices).toEqual(original.vertices);
    expect(decoded.sectors[0].floorTextureIndex).toBe(0);
    expect(decoded.strings).toEqual(['FLOOR4_8', 'CEIL3_5', '-', 'STARTAN3']);
    expect(decoded.linedefs[0].side1).toBe(0xffff);
  });

  it('diff reports identical documents', () => {
    const doc = sampleDoc();
    const decodedA = readGzstate(writeGzstate(doc));
    const decodedB = readGzstate(writeGzstate(doc));
    expect(diffGzstate(decodedA, decodedB).identical).toBe(true);
  });

  it('diff reports sector mismatch', () => {
    const left = sampleDoc();
    const right = sampleDoc();
    right.sectors[0].floorHeight = 64;
    const result = diffGzstate(left, right);
    expect(result.identical).toBe(false);
    expect(result.sectionDiffs.some((s) => s.sectionName === 'sectors')).toBe(true);
  });

  it('reads real E1M1 GZDoom dump fixture', () => {
    const fixturePath = path.join(process.cwd(), 'artifacts/gzrender-v2/gzdoom/E1M1.gzstate');
    if (!fs.existsSync(fixturePath)) {
      return;
    }
    const raw = fs.readFileSync(fixturePath);
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const doc = readGzstate(buffer);
    expect(doc.header.mapName).toBe('E1M1');
    expect(doc.vertices.length).toBe(470);
    expect(doc.sectors.length).toBe(88);
    expect(doc.linedefs.length).toBe(486);
    expect(doc.sidedefs.length).toBe(666);
    expect(doc.segs.length).toBeGreaterThan(0);
    expect(doc.subsectors.length).toBe(239);
    expect(doc.nodes.length).toBe(238);
    expect(doc.things.length).toBe(143);
    expect(doc.lumpCatalog.length).toBe(1832);
    expect(doc.patchRasters.length).toBeGreaterThan(300);
  });
});
