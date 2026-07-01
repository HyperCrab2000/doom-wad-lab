import { describe, expect, it } from 'vitest';
import { crc32 } from '../../../../gzstate/crc32';
import {
  GZDRAW_FLAGS_CRC_ENABLED,
  GZDRAW_HEADER_SIZE,
  GZDRAW_MAGIC,
  GZDRAW_MAP_NAME_BYTES,
  GZDRAW_SECTION,
  GZDRAW_SECTION_ENTRY_SIZE,
  GZDRAW_VERSION,
} from './constants';
import { diffGzdraw, formatGzdrawDiff } from './gzdrawDiff';
import { readGzdraw } from './gzdrawReader';

function cameraPayload(x: number, y: number, z: number, yaw: number, pitch: number, yawBam: number): Uint8Array {
  const buf = new ArrayBuffer(24);
  const view = new DataView(buf);
  view.setFloat32(0, x, true);
  view.setFloat32(4, y, true);
  view.setFloat32(8, z, true);
  view.setFloat32(12, yaw, true);
  view.setFloat32(16, pitch, true);
  view.setUint32(20, yawBam, true);
  return new Uint8Array(buf);
}

function u32ListPayload(values: number[]): Uint8Array {
  const buf = new ArrayBuffer(4 + values.length * 4);
  const view = new DataView(buf);
  view.setUint32(0, values.length, true);
  values.forEach((value, index) => {
    view.setUint32(4 + index * 4, value, true);
  });
  return new Uint8Array(buf);
}

function wallsPayload(
  entries: Array<{ linedef: number; side: number; segIndex: number; sortKey: number; flags: number }>,
): Uint8Array {
  const buf = new ArrayBuffer(4 + entries.length * 16);
  const view = new DataView(buf);
  view.setUint32(0, entries.length, true);
  entries.forEach((entry, index) => {
    const base = 4 + index * 16;
    view.setUint32(base, entry.linedef, true);
    view.setUint16(base + 4, entry.side, true);
    view.setUint16(base + 6, entry.segIndex, true);
    view.setUint32(base + 8, entry.sortKey, true);
    view.setUint32(base + 12, entry.flags, true);
  });
  return new Uint8Array(buf);
}

function spritesPayload(count: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, count, true);
  return new Uint8Array(buf);
}

function portalSnapshotPayload(stackDepth: number, clipCount: number): Uint8Array {
  const buf = new ArrayBuffer(8 + clipCount * 24);
  const view = new DataView(buf);
  view.setUint32(0, stackDepth, true);
  view.setUint32(4, clipCount, true);
  return new Uint8Array(buf);
}

function writeGzdraw(
  sections: Array<{ typeId: number; payload: Uint8Array }>,
  options?: { mapName?: string; probeId?: number },
): Uint8Array {
  const mapName = options?.mapName ?? 'E1M1';
  const probeId = options?.probeId ?? 0;
  const directorySize = sections.length * GZDRAW_SECTION_ENTRY_SIZE;
  const payloadSize = sections.reduce((sum, section) => sum + section.payload.length, 0);
  const totalSize = GZDRAW_HEADER_SIZE + directorySize + payloadSize;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  let offset = 0;

  view.setUint32(offset, GZDRAW_MAGIC, true);
  offset += 4;
  view.setUint32(offset, GZDRAW_VERSION, true);
  offset += 4;
  view.setUint32(offset, GZDRAW_FLAGS_CRC_ENABLED, true);
  offset += 4;
  view.setUint32(offset, GZDRAW_HEADER_SIZE, true);
  offset += 4;
  view.setUint32(offset, sections.length, true);
  offset += 4;
  view.setUint32(offset, GZDRAW_HEADER_SIZE, true);
  offset += 4;

  const mapBytes = new TextEncoder().encode(mapName);
  for (let i = 0; i < GZDRAW_MAP_NAME_BYTES; i++) {
    view.setUint8(offset + i, i < mapBytes.length ? mapBytes[i] : 0);
  }
  offset += GZDRAW_MAP_NAME_BYTES;
  view.setUint32(offset, probeId, true);
  offset += 4;
  view.setUint32(offset, 0, true);
  offset += 4;

  let dataOffset = GZDRAW_HEADER_SIZE + directorySize;
  for (const section of sections) {
    view.setUint32(offset, section.typeId, true);
    offset += 4;
    view.setUint32(offset, dataOffset, true);
    offset += 4;
    view.setUint32(offset, section.payload.length, true);
    offset += 4;
    view.setUint32(offset, crc32(section.payload), true);
    offset += 4;
    dataOffset += section.payload.length;
  }

  for (const section of sections) {
    new Uint8Array(buf, offset, section.payload.length).set(section.payload);
    offset += section.payload.length;
  }

  return new Uint8Array(buf);
}

function minimalDoc(): Uint8Array {
  return writeGzdraw([
    { typeId: GZDRAW_SECTION.CAMERA, payload: cameraPayload(100, 200, 41, 90, 0, 16384) },
    { typeId: GZDRAW_SECTION.SUBSECTORS, payload: u32ListPayload([1, 2, 3]) },
    { typeId: GZDRAW_SECTION.SECTORS, payload: u32ListPayload([10, 11]) },
    {
      typeId: GZDRAW_SECTION.WALLS,
      payload: wallsPayload([{ linedef: 7, side: 0, segIndex: 12, sortKey: 0, flags: 0 }]),
    },
    { typeId: GZDRAW_SECTION.SPRITES, payload: spritesPayload(0) },
    { typeId: GZDRAW_SECTION.PORTAL_SNAPSHOT, payload: portalSnapshotPayload(0, 0) },
  ]);
}

describe('gzdrawReader', () => {
  it('parses a minimal valid buffer', () => {
    const doc = readGzdraw(minimalDoc().buffer);
    expect(doc.header.magic).toBe(GZDRAW_MAGIC);
    expect(doc.header.version).toBe(GZDRAW_VERSION);
    expect(doc.header.flags).toBe(GZDRAW_FLAGS_CRC_ENABLED);
    expect(doc.header.sectionCount).toBe(6);
    expect(doc.header.mapName).toBe('E1M1');
    expect(doc.header.probeId).toBe(0);
    expect(doc.camera).toEqual({ x: 100, y: 200, z: 41, yaw: 90, pitch: 0, yawBam: 16384 });
    expect(doc.subsectors).toEqual([1, 2, 3]);
    expect(doc.sectors).toEqual([10, 11]);
    expect(doc.walls).toEqual([{ linedef: 7, side: 0, segIndex: 12, sortKey: 0, flags: 0 }]);
    expect(doc.sprites).toEqual([]);
    expect(doc.portalSnapshot).toEqual({ stackDepth: 0, clipCount: 0, clips: [] });
  });

  it('reports identical documents as empty diff', () => {
    const bytes = minimalDoc();
    const left = readGzdraw(bytes.buffer);
    const right = readGzdraw(bytes.buffer.slice(0));
    const result = diffGzdraw(left, right);
    expect(result.identical).toBe(true);
    expect(formatGzdrawDiff(result)).toBe('GZDRAW files are identical.');
  });

  it('reports an extra subsector with index', () => {
    const leftBytes = minimalDoc();
    const rightBytes = writeGzdraw([
      { typeId: GZDRAW_SECTION.CAMERA, payload: cameraPayload(100, 200, 41, 90, 0, 16384) },
      { typeId: GZDRAW_SECTION.SUBSECTORS, payload: u32ListPayload([1, 2, 3, 99]) },
      { typeId: GZDRAW_SECTION.SECTORS, payload: u32ListPayload([10, 11]) },
      {
        typeId: GZDRAW_SECTION.WALLS,
        payload: wallsPayload([{ linedef: 7, side: 0, segIndex: 12, sortKey: 0, flags: 0 }]),
      },
      { typeId: GZDRAW_SECTION.SPRITES, payload: spritesPayload(0) },
      { typeId: GZDRAW_SECTION.PORTAL_SNAPSHOT, payload: portalSnapshotPayload(0, 0) },
    ]);

    const result = diffGzdraw(readGzdraw(leftBytes.buffer), readGzdraw(rightBytes.buffer));
    expect(result.identical).toBe(false);
    expect(result.sectionDiffs).toHaveLength(1);
    expect(result.sectionDiffs[0]?.sectionName).toBe('subsectors');
    expect(result.sectionDiffs[0]?.fieldDiffs).toEqual([
      { path: 'subsectors[3]', left: undefined, right: 99 },
    ]);

    const report = formatGzdrawDiff(result);
    expect(report).toContain('subsectors[3]');
    expect(report).toContain('99');
  });
});
