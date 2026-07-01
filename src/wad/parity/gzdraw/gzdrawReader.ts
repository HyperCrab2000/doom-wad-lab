import { BinaryReader } from '../../../../gzstate/binaryReader';
import { crc32 } from '../../../../gzstate/crc32';
import {
  GZDRAW_FLAGS_CRC_ENABLED,
  GZDRAW_HEADER_SIZE,
  GZDRAW_MAGIC,
  GZDRAW_MAP_NAME_BYTES,
  GZDRAW_SECTION,
  GZDRAW_VERSION,
} from './constants';
import type {
  GzdrawCamera,
  GzdrawFlatEntry,
  GzdrawDrawMeta,
  GzdrawDocument,
  GzdrawHeader,
  GzdrawPortalClipLine,
  GzdrawPortalSnapshot,
  GzdrawSectionEntry,
  GzdrawSpriteEntry,
  GzdrawWallEntry,
} from './types';

function readCamera(reader: BinaryReader, payloadLength: number): GzdrawCamera {
  if (payloadLength !== 24) {
    throw new Error(`camera section expected 24 bytes, got ${payloadLength}`);
  }
  return {
    x: reader.readFloat32(),
    y: reader.readFloat32(),
    z: reader.readFloat32(),
    yaw: reader.readFloat32(),
    pitch: reader.readFloat32(),
    yawBam: reader.readUint32(),
  };
}

function readUint32List(reader: BinaryReader, payloadLength: number): number[] {
  if (payloadLength < 4) {
    throw new Error(`u32 list section too short (${payloadLength} bytes)`);
  }
  const count = reader.readUint32();
  const expected = 4 + count * 4;
  if (payloadLength !== expected) {
    throw new Error(
      `u32 list section length mismatch: header count ${count} expects ${expected} bytes, got ${payloadLength}`,
    );
  }
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(reader.readUint32());
  }
  return values;
}

function readWalls(reader: BinaryReader, payloadLength: number): GzdrawWallEntry[] {
  if (payloadLength < 4) {
    throw new Error(`walls section too short (${payloadLength} bytes)`);
  }
  const count = reader.readUint32();
  const expected = 4 + count * 16;
  if (payloadLength !== expected) {
    throw new Error(
      `walls section length mismatch: header count ${count} expects ${expected} bytes, got ${payloadLength}`,
    );
  }
  const walls: GzdrawWallEntry[] = [];
  for (let i = 0; i < count; i++) {
    walls.push({
      linedef: reader.readUint32(),
      side: reader.readUint16(),
      segIndex: reader.readUint16(),
      sortKey: reader.readUint32(),
      flags: reader.readUint32(),
    });
  }
  return walls;
}

function readSprites(reader: BinaryReader, payloadLength: number): GzdrawSpriteEntry[] {
  if (payloadLength < 4) {
    throw new Error(`sprites section too short (${payloadLength} bytes)`);
  }
  const count = reader.readUint32();
  const expected = 4 + count * 16;
  if (payloadLength !== expected) {
    throw new Error(
      `sprites section length mismatch: header count ${count} expects ${expected} bytes, got ${payloadLength}`,
    );
  }
  const sprites: GzdrawSpriteEntry[] = [];
  for (let i = 0; i < count; i++) {
    sprites.push({
      thingIndex: reader.readUint32(),
      spriteFrame: reader.readUint32(),
      sortKey: reader.readUint32(),
      flags: reader.readUint32(),
    });
  }
  return sprites;
}

function readPortalSnapshot(reader: BinaryReader, payloadLength: number): GzdrawPortalSnapshot {
  if (payloadLength < 8) {
    throw new Error(`portal_snapshot section too short (${payloadLength} bytes)`);
  }
  const stackDepth = reader.readUint32();
  const clipCount = reader.readUint32();
  const expected = 8 + clipCount * 24;
  if (payloadLength !== expected) {
    throw new Error(
      `portal_snapshot length mismatch: clipCount ${clipCount} expects ${expected} bytes, got ${payloadLength}`,
    );
  }
  const clips: GzdrawPortalClipLine[] = [];
  for (let i = 0; i < clipCount; i++) {
    clips.push({
      x1: reader.readFloat32(),
      y1: reader.readFloat32(),
      x2: reader.readFloat32(),
      y2: reader.readFloat32(),
      portalId: reader.readUint32(),
      flags: reader.readUint32(),
    });
  }
  return { stackDepth, clipCount, clips };
}

function readFlats(reader: BinaryReader, payloadLength: number): GzdrawFlatEntry[] {
  if (payloadLength < 4) {
    throw new Error(`flat_draws section too short (${payloadLength} bytes)`);
  }
  const count = reader.readUint32();
  const expected = 4 + count * 12;
  if (payloadLength !== expected) {
    throw new Error(
      `flat_draws section length mismatch: header count ${count} expects ${expected} bytes, got ${payloadLength}`,
    );
  }
  const flats: GzdrawFlatEntry[] = [];
  for (let i = 0; i < count; i++) {
    flats.push({
      subsectorIndex: reader.readUint32(),
      sectorIndex: reader.readUint32(),
      sortKey: reader.readUint32(),
    });
  }
  return flats;
}

function readDrawMeta(reader: BinaryReader, payloadLength: number): GzdrawDrawMeta {
  const expected = 16 + 8;
  if (payloadLength !== expected) {
    throw new Error(`draw_meta section expected ${expected} bytes, got ${payloadLength}`);
  }
  return {
    flatDrawMode: reader.readUint32(),
    wallCount: reader.readUint32(),
    spriteCount: reader.readUint32(),
    subsectorCount: reader.readUint32(),
    engineTag: reader.readFixedAscii(8),
  };
}

function readHeader(reader: BinaryReader): GzdrawHeader {
  const magic = reader.readUint32();
  if (magic !== GZDRAW_MAGIC) {
    throw new Error(`invalid GZDRAW magic 0x${magic.toString(16)} (expected 0x${GZDRAW_MAGIC.toString(16)})`);
  }
  const version = reader.readUint32();
  if (version !== GZDRAW_VERSION) {
    throw new Error(`unsupported GZDRAW version ${version} (expected ${GZDRAW_VERSION})`);
  }
  const flags = reader.readUint32();
  const headerSize = reader.readUint32();
  const sectionCount = reader.readUint32();
  const sectionDirectoryOffset = reader.readUint32();
  const mapName = reader.readFixedAscii(GZDRAW_MAP_NAME_BYTES);
  const probeId = reader.readUint32();
  reader.readUint32(); // reserved
  if (headerSize !== GZDRAW_HEADER_SIZE) {
    throw new Error(`unexpected GZDRAW header size ${headerSize}`);
  }
  return {
    magic,
    version,
    flags,
    headerSize,
    sectionCount,
    sectionDirectoryOffset,
    mapName,
    probeId,
  };
}

function readSectionDirectory(reader: BinaryReader, count: number): GzdrawSectionEntry[] {
  const sections: GzdrawSectionEntry[] = [];
  for (let i = 0; i < count; i++) {
    sections.push({
      sectionId: reader.readUint32(),
      offset: reader.readUint32(),
      byteSize: reader.readUint32(),
      crc32: reader.readUint32(),
    });
  }
  return sections;
}

function applySection(doc: GzdrawDocument, typeId: number, payload: Uint8Array): void {
  const reader = new BinaryReader(
    payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
  );

  switch (typeId) {
    case GZDRAW_SECTION.CAMERA:
      doc.camera = readCamera(reader, payload.length);
      break;
    case GZDRAW_SECTION.SUBSECTORS:
      doc.subsectors = readUint32List(reader, payload.length);
      break;
    case GZDRAW_SECTION.SECTORS:
      doc.sectors = readUint32List(reader, payload.length);
      break;
    case GZDRAW_SECTION.WALLS:
      doc.walls = readWalls(reader, payload.length);
      break;
    case GZDRAW_SECTION.SPRITES:
      doc.sprites = readSprites(reader, payload.length);
      break;
    case GZDRAW_SECTION.PORTAL_SNAPSHOT:
      doc.portalSnapshot = readPortalSnapshot(reader, payload.length);
      break;
    case GZDRAW_SECTION.FLAT_DRAWS:
      doc.flats = readFlats(reader, payload.length);
      break;
    case GZDRAW_SECTION.DRAW_META:
      doc.drawMeta = readDrawMeta(reader, payload.length);
      break;
    default:
      break;
  }
}

export function readGzdraw(buffer: ArrayBuffer): GzdrawDocument {
  const reader = new BinaryReader(buffer);
  if (reader.byteLength < GZDRAW_HEADER_SIZE) {
    throw new Error(`GZDRAW buffer too short (${reader.byteLength} bytes)`);
  }

  const header = readHeader(reader);
  if (reader.offset !== header.sectionDirectoryOffset) {
    throw new Error(
      `GZDRAW section directory offset mismatch: header says ${header.sectionDirectoryOffset}, at ${reader.offset}`,
    );
  }

  const sections = readSectionDirectory(reader, header.sectionCount);
  const crcEnabled = (header.flags & GZDRAW_FLAGS_CRC_ENABLED) !== 0;

  const doc: GzdrawDocument = {
    header,
    sections,
    camera: null,
    subsectors: [],
    sectors: [],
    walls: [],
    sprites: [],
    portalSnapshot: null,
    flats: [],
    drawMeta: null,
  };

  for (const section of sections) {
    if (section.offset + section.byteSize > reader.byteLength) {
      throw new Error(
        `truncated GZDRAW section payload (type ${section.sectionId}, offset ${section.offset}, size ${section.byteSize})`,
      );
    }
    const payload = new Uint8Array(buffer, section.offset, section.byteSize);
    if (crcEnabled && section.crc32 !== crc32(payload)) {
      throw new Error(
        `GZDRAW section ${section.sectionId} CRC mismatch: expected 0x${section.crc32.toString(16)}, got 0x${crc32(payload).toString(16)}`,
      );
    }
    applySection(doc, section.sectionId, payload);
  }

  return doc;
}

export function readGzdrawFile(bytes: Uint8Array): GzdrawDocument {
  return readGzdraw(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
