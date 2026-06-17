import {
  GZSTATE_ENGINE_TAG_BYTES,
  GZSTATE_HEADER_SIZE,
  GZSTATE_MAGIC,
  GZSTATE_MAP_NAME_BYTES,
  GZSTATE_SECTION,
  GZSTATE_SECTION_ENTRY_SIZE,
  GZSTATE_VERSION,
} from './constants';
import { BinaryWriter } from './binaryWriter';
import { crc32 } from './crc32';
import type { GzstateDocument } from './types';

interface SectionPayload {
  sectionId: number;
  bytes: Uint8Array;
}

function writeStringTable(strings: string[]): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(strings.length);
  for (const value of strings) {
    const encoded = new TextEncoder().encode(value);
    writer.writeUint32(encoded.length);
    writer.writeBytes(encoded);
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeVertices(doc: GzstateDocument): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(doc.vertices.length);
  for (const v of doc.vertices) {
    writer.writeInt32(v.x);
    writer.writeInt32(v.y);
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeSectors(doc: GzstateDocument): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(doc.sectors.length);
  for (const s of doc.sectors) {
    writer.writeInt32(s.floorHeight);
    writer.writeInt32(s.ceilingHeight);
    writer.writeInt16(s.lightLevel);
    writer.writeUint16(s.special);
    writer.writeInt16(s.tag);
    writer.writeUint32(s.floorTextureIndex);
    writer.writeUint32(s.ceilingTextureIndex);
    writer.writeUint32(s.flags);
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeSidedefs(doc: GzstateDocument): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(doc.sidedefs.length);
  for (const s of doc.sidedefs) {
    writer.writeInt32(s.textureOffsetX);
    writer.writeInt32(s.textureOffsetY);
    writer.writeUint32(s.topTextureIndex);
    writer.writeUint32(s.bottomTextureIndex);
    writer.writeUint32(s.midTextureIndex);
    writer.writeUint32(s.sectorIndex);
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeLinedefs(doc: GzstateDocument): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(doc.linedefs.length);
  for (const l of doc.linedefs) {
    writer.writeUint32(l.vertex1);
    writer.writeUint32(l.vertex2);
    writer.writeUint32(l.flags);
    writer.writeUint32(l.flags2);
    writer.writeUint16(l.special);
    writer.writeUint16(l.side0);
    writer.writeUint16(l.side1);
    writer.writeInt16(l.tag);
    writer.writeUint32(l.activation);
    for (const arg of l.args) writer.writeInt32(arg);
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeSegs(doc: GzstateDocument): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(doc.segs.length);
  for (const s of doc.segs) {
    writer.writeUint32(s.vertex1);
    writer.writeUint32(s.vertex2);
    writer.writeInt16(s.angle);
    writer.writeUint16(s.linedef);
    writer.writeInt16(s.side);
    writer.writeInt16(s.offset);
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeSubsectors(doc: GzstateDocument): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(doc.subsectors.length);
  for (const s of doc.subsectors) {
    writer.writeUint32(s.numSegs);
    writer.writeUint32(s.firstSeg);
    writer.writeUint32(s.sectorIndex);
    writer.writeUint16(s.flags);
    writer.writeUint16(0);
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeNodes(doc: GzstateDocument): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(doc.nodes.length);
  for (const n of doc.nodes) {
    writer.writeInt16(n.x);
    writer.writeInt16(n.y);
    writer.writeInt16(n.dx);
    writer.writeInt16(n.dy);
    writer.writeUint32(n.child0);
    writer.writeUint32(n.child1);
    for (let i = 0; i < 8; i++) writer.writeInt16(n.bbox[i] ?? 0);
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeThings(doc: GzstateDocument): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(doc.things.length);
  for (const t of doc.things) {
    writer.writeInt32(t.x);
    writer.writeInt32(t.y);
    writer.writeInt32(t.z);
    writer.writeUint16(t.angle);
    writer.writeUint16(t.type);
    writer.writeUint32(t.flags);
    writer.writeUint16(t.tid);
    writer.writeUint16(0);
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeLumpCatalog(doc: GzstateDocument): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(doc.lumpCatalog.length);
  for (const entry of doc.lumpCatalog) {
    writer.writeUint32(entry.nameIndex);
    writer.writeUint32(entry.byteLength);
    writer.writeUint32(entry.crc32);
    writer.writeUint8(entry.category);
    writer.writeUint8(0);
    writer.writeUint8(0);
    writer.writeUint8(0);
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeTextureDefs(doc: GzstateDocument): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(doc.textureDefs.length);
  for (const tex of doc.textureDefs) {
    writer.writeUint32(tex.nameIndex);
    writer.writeUint16(tex.width);
    writer.writeUint16(tex.height);
    writer.writeUint16(tex.patches.length);
    writer.writeUint16(0);
    for (const patch of tex.patches) {
      writer.writeInt16(patch.originX);
      writer.writeInt16(patch.originY);
      writer.writeUint16(patch.patchIndex);
      writer.writeUint16(0);
    }
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeRasterDigests(digests: GzstateDocument['patchRasters']): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(digests.length);
  for (const digest of digests) {
    writer.writeUint32(digest.nameIndex);
    writer.writeUint32(digest.kind);
    writer.writeUint16(digest.width);
    writer.writeUint16(digest.height);
    writer.writeUint32(digest.rgbaCrc32);
  }
  return new Uint8Array(writer.toArrayBuffer());
}

function writeStringIndexList(values: number[]): Uint8Array {
  const writer = new BinaryWriter();
  writer.writeUint32(values.length);
  for (const index of values) writer.writeUint32(index);
  return new Uint8Array(writer.toArrayBuffer());
}

function collectSectionPayloads(doc: GzstateDocument): SectionPayload[] {
  const payloads: SectionPayload[] = [
    { sectionId: GZSTATE_SECTION.STRING_TABLE, bytes: writeStringTable(doc.strings) },
    { sectionId: GZSTATE_SECTION.VERTICES, bytes: writeVertices(doc) },
    { sectionId: GZSTATE_SECTION.SECTORS, bytes: writeSectors(doc) },
    { sectionId: GZSTATE_SECTION.SIDEDEFS, bytes: writeSidedefs(doc) },
    { sectionId: GZSTATE_SECTION.LINEDEFS, bytes: writeLinedefs(doc) },
    { sectionId: GZSTATE_SECTION.SEGS, bytes: writeSegs(doc) },
    { sectionId: GZSTATE_SECTION.SUBSECTORS, bytes: writeSubsectors(doc) },
    { sectionId: GZSTATE_SECTION.NODES, bytes: writeNodes(doc) },
    { sectionId: GZSTATE_SECTION.THINGS, bytes: writeThings(doc) },
    { sectionId: GZSTATE_SECTION.LUMP_CATALOG, bytes: writeLumpCatalog(doc) },
    { sectionId: GZSTATE_SECTION.TEXTURE_DEFS, bytes: writeTextureDefs(doc) },
    { sectionId: GZSTATE_SECTION.FLAT_NAMES, bytes: writeStringIndexList(doc.flatNames) },
    { sectionId: GZSTATE_SECTION.SPRITE_NAMES, bytes: writeStringIndexList(doc.spriteNames) },
    { sectionId: GZSTATE_SECTION.MUSIC_NAMES, bytes: writeStringIndexList(doc.musicNames) },
    { sectionId: GZSTATE_SECTION.SOUND_NAMES, bytes: writeStringIndexList(doc.soundNames) },
    { sectionId: GZSTATE_SECTION.PNAMES, bytes: writeStringIndexList(doc.pnames) },
    { sectionId: GZSTATE_SECTION.PATCH_RASTERS, bytes: writeRasterDigests(doc.patchRasters) },
    { sectionId: GZSTATE_SECTION.FLAT_RASTERS, bytes: writeRasterDigests(doc.flatRasters) },
    { sectionId: GZSTATE_SECTION.SPRITE_RASTERS, bytes: writeRasterDigests(doc.spriteRasters) },
    { sectionId: GZSTATE_SECTION.TEXTURE_RASTERS, bytes: writeRasterDigests(doc.textureRasters) },
  ];
  return payloads.filter((p) => p.bytes.byteLength > 4 || p.sectionId === GZSTATE_SECTION.STRING_TABLE);
}

export function writeGzstate(doc: GzstateDocument): ArrayBuffer {
  const payloads = collectSectionPayloads(doc);
  const sectionDirOffset = GZSTATE_HEADER_SIZE;
  const dataOffset = sectionDirOffset + payloads.length * GZSTATE_SECTION_ENTRY_SIZE;

  let cursor = dataOffset;
  const entries = payloads.map((payload) => {
    const entry = {
      sectionId: payload.sectionId,
      offset: cursor,
      byteSize: payload.bytes.byteLength,
      crc32: crc32(payload.bytes),
    };
    cursor += payload.bytes.byteLength;
    return entry;
  });

  const writer = new BinaryWriter();
  writer.writeUint32(GZSTATE_MAGIC);
  writer.writeUint32(GZSTATE_VERSION);
  writer.writeUint32(doc.header.flags);
  writer.writeUint32(GZSTATE_HEADER_SIZE);
  writer.writeUint32(entries.length);
  writer.writeUint32(sectionDirOffset);
  writer.writeFixedAscii(doc.header.mapName, GZSTATE_MAP_NAME_BYTES);
  writer.writeFixedAscii(doc.header.engineTag, GZSTATE_ENGINE_TAG_BYTES);

  for (const entry of entries) {
    writer.writeUint32(entry.sectionId);
    writer.writeUint32(entry.offset);
    writer.writeUint32(entry.byteSize);
    writer.writeUint32(entry.crc32);
  }

  for (const payload of payloads) {
    writer.writeBytes(payload.bytes);
  }

  return writer.toArrayBuffer();
}

export function internString(strings: string[], value: string): number {
  const existing = strings.indexOf(value);
  if (existing >= 0) return existing;
  strings.push(value);
  return strings.length - 1;
}
