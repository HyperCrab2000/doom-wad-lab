import {
  GZSTATE_ENGINE_TAG_BYTES,
  GZSTATE_HEADER_SIZE,
  GZSTATE_MAGIC,
  GZSTATE_MAP_NAME_BYTES,
  GZSTATE_SECTION,
  GZSTATE_SECTION_ENTRY_SIZE,
  GZSTATE_VERSION,
} from './constants';
import { BinaryReader } from './binaryReader';
import type {
  GzstateDocument,
  GzstateHeader,
  GzstateLineDef,
  GzstateLumpCatalogEntry,
  GzstateNode,
  GzstateRasterDigest,
  GzstateSectionEntry,
  GzstateSector,
  GzstateSeg,
  GzstateSideDef,
  GzstateSubsector,
  GzstateTextureDef,
  GzstateThing,
  GzstateVertex,
} from './types';

function readStringTable(reader: BinaryReader): string[] {
  const count = reader.readUint32();
  const strings: string[] = [];
  for (let i = 0; i < count; i++) {
    const length = reader.readUint32();
    const bytes = reader.readBytes(length);
    strings.push(new TextDecoder().decode(bytes));
  }
  return strings;
}

function readVertices(reader: BinaryReader): GzstateVertex[] {
  const count = reader.readUint32();
  const vertices: GzstateVertex[] = [];
  for (let i = 0; i < count; i++) {
    vertices.push({ x: reader.readInt32(), y: reader.readInt32() });
  }
  return vertices;
}

function readSectors(reader: BinaryReader): GzstateSector[] {
  const count = reader.readUint32();
  const sectors: GzstateSector[] = [];
  for (let i = 0; i < count; i++) {
    sectors.push({
      floorHeight: reader.readInt32(),
      ceilingHeight: reader.readInt32(),
      lightLevel: reader.readInt16(),
      special: reader.readUint16(),
      tag: reader.readInt16(),
      floorTextureIndex: reader.readUint32(),
      ceilingTextureIndex: reader.readUint32(),
      flags: reader.readUint32(),
    });
  }
  return sectors;
}

function readSidedefs(reader: BinaryReader): GzstateSideDef[] {
  const count = reader.readUint32();
  const sidedefs: GzstateSideDef[] = [];
  for (let i = 0; i < count; i++) {
    sidedefs.push({
      textureOffsetX: reader.readInt32(),
      textureOffsetY: reader.readInt32(),
      topTextureIndex: reader.readUint32(),
      bottomTextureIndex: reader.readUint32(),
      midTextureIndex: reader.readUint32(),
      sectorIndex: reader.readUint32(),
    });
  }
  return sidedefs;
}

function readLinedefs(reader: BinaryReader): GzstateLineDef[] {
  const count = reader.readUint32();
  const linedefs: GzstateLineDef[] = [];
  for (let i = 0; i < count; i++) {
    linedefs.push({
      vertex1: reader.readUint32(),
      vertex2: reader.readUint32(),
      flags: reader.readUint32(),
      flags2: reader.readUint32(),
      special: reader.readUint16(),
      side0: reader.readUint16(),
      side1: reader.readUint16(),
      tag: reader.readInt16(),
      activation: reader.readUint32(),
      args: [
        reader.readInt32(),
        reader.readInt32(),
        reader.readInt32(),
        reader.readInt32(),
        reader.readInt32(),
      ],
    });
  }
  return linedefs;
}

function readSegs(reader: BinaryReader): GzstateSeg[] {
  const count = reader.readUint32();
  const segs: GzstateSeg[] = [];
  for (let i = 0; i < count; i++) {
    segs.push({
      vertex1: reader.readUint32(),
      vertex2: reader.readUint32(),
      angle: reader.readInt16(),
      linedef: reader.readUint16(),
      side: reader.readInt16(),
      offset: reader.readInt16(),
    });
  }
  return segs;
}

function readSubsectors(reader: BinaryReader): GzstateSubsector[] {
  const count = reader.readUint32();
  const subsectors: GzstateSubsector[] = [];
  for (let i = 0; i < count; i++) {
    subsectors.push({
      numSegs: reader.readUint32(),
      firstSeg: reader.readUint32(),
      sectorIndex: reader.readUint32(),
      flags: reader.readUint16(),
    });
    reader.readUint16(); // padding
  }
  return subsectors;
}

function readNodes(reader: BinaryReader): GzstateNode[] {
  const count = reader.readUint32();
  const nodes: GzstateNode[] = [];
  for (let i = 0; i < count; i++) {
    const node: GzstateNode = {
      x: reader.readInt16(),
      y: reader.readInt16(),
      dx: reader.readInt16(),
      dy: reader.readInt16(),
      bbox: new Int16Array(8),
      child0: reader.readUint32(),
      child1: reader.readUint32(),
    };
    for (let b = 0; b < 8; b++) node.bbox[b] = reader.readInt16();
    nodes.push(node);
  }
  return nodes;
}

function readThings(reader: BinaryReader): GzstateThing[] {
  const count = reader.readUint32();
  const things: GzstateThing[] = [];
  for (let i = 0; i < count; i++) {
    things.push({
      x: reader.readInt32(),
      y: reader.readInt32(),
      z: reader.readInt32(),
      angle: reader.readUint16(),
      type: reader.readUint16(),
      flags: reader.readUint32(),
      tid: reader.readUint16(),
    });
    reader.readUint16(); // padding
  }
  return things;
}

function readLumpCatalog(reader: BinaryReader): GzstateLumpCatalogEntry[] {
  const count = reader.readUint32();
  const entries: GzstateLumpCatalogEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      nameIndex: reader.readUint32(),
      byteLength: reader.readUint32(),
      crc32: reader.readUint32(),
      category: reader.readUint8(),
    });
    reader.readUint8();
    reader.readUint8();
    reader.readUint8();
  }
  return entries;
}

function readTextureDefs(reader: BinaryReader): GzstateTextureDef[] {
  const count = reader.readUint32();
  const textures: GzstateTextureDef[] = [];
  for (let i = 0; i < count; i++) {
    const nameIndex = reader.readUint32();
    const width = reader.readUint16();
    const height = reader.readUint16();
    const patchCount = reader.readUint16();
    reader.readUint16();
    const patches = [];
    for (let p = 0; p < patchCount; p++) {
      patches.push({
        originX: reader.readInt16(),
        originY: reader.readInt16(),
        patchIndex: reader.readUint16(),
      });
      reader.readUint16();
    }
    textures.push({ nameIndex, width, height, patches });
  }
  return textures;
}

function readRasterDigests(reader: BinaryReader): GzstateRasterDigest[] {
  const count = reader.readUint32();
  const digests: GzstateRasterDigest[] = [];
  for (let i = 0; i < count; i++) {
    digests.push({
      nameIndex: reader.readUint32(),
      kind: reader.readUint32(),
      width: reader.readUint16(),
      height: reader.readUint16(),
      rgbaCrc32: reader.readUint32(),
    });
  }
  return digests;
}

function readStringIndexList(reader: BinaryReader): number[] {
  const count = reader.readUint32();
  const values: number[] = [];
  for (let i = 0; i < count; i++) values.push(reader.readUint32());
  return values;
}

function readHeader(reader: BinaryReader): GzstateHeader {
  const magic = reader.readUint32();
  if (magic !== GZSTATE_MAGIC) {
    throw new Error(`Invalid GZSTATE magic: 0x${magic.toString(16)}`);
  }
  const version = reader.readUint32();
  if (version !== GZSTATE_VERSION) {
    throw new Error(`Unsupported GZSTATE version: ${version}`);
  }
  const flags = reader.readUint32();
  const headerSize = reader.readUint32();
  const sectionCount = reader.readUint32();
  const sectionDirectoryOffset = reader.readUint32();
  const mapName = reader.readFixedAscii(GZSTATE_MAP_NAME_BYTES);
  const engineTag = reader.readFixedAscii(GZSTATE_ENGINE_TAG_BYTES);
  if (headerSize !== GZSTATE_HEADER_SIZE) {
    throw new Error(`Unexpected header size ${headerSize}`);
  }
  return {
    magic,
    version,
    flags,
    headerSize,
    sectionCount,
    sectionDirectoryOffset,
    mapName,
    engineTag,
  };
}

function readSectionDirectory(reader: BinaryReader, count: number): GzstateSectionEntry[] {
  const sections: GzstateSectionEntry[] = [];
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

export function readGzstate(buffer: ArrayBuffer): GzstateDocument {
  const root = new BinaryReader(buffer);
  const header = readHeader(root);
  root.offset = header.sectionDirectoryOffset;
  const sections = readSectionDirectory(root, header.sectionCount);

  const doc: GzstateDocument = {
    header,
    sections,
    strings: [],
    vertices: [],
    sectors: [],
    sidedefs: [],
    linedefs: [],
    segs: [],
    subsectors: [],
    nodes: [],
    things: [],
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

  for (const section of sections) {
    const reader = new BinaryReader(buffer);
    reader.offset = section.offset;
    switch (section.sectionId) {
      case GZSTATE_SECTION.STRING_TABLE:
        doc.strings = readStringTable(reader);
        break;
      case GZSTATE_SECTION.VERTICES:
        doc.vertices = readVertices(reader);
        break;
      case GZSTATE_SECTION.SECTORS:
        doc.sectors = readSectors(reader);
        break;
      case GZSTATE_SECTION.SIDEDEFS:
        doc.sidedefs = readSidedefs(reader);
        break;
      case GZSTATE_SECTION.LINEDEFS:
        doc.linedefs = readLinedefs(reader);
        break;
      case GZSTATE_SECTION.SEGS:
        doc.segs = readSegs(reader);
        break;
      case GZSTATE_SECTION.SUBSECTORS:
        doc.subsectors = readSubsectors(reader);
        break;
      case GZSTATE_SECTION.NODES:
        doc.nodes = readNodes(reader);
        break;
      case GZSTATE_SECTION.THINGS:
        doc.things = readThings(reader);
        break;
      case GZSTATE_SECTION.LUMP_CATALOG:
        doc.lumpCatalog = readLumpCatalog(reader);
        break;
      case GZSTATE_SECTION.TEXTURE_DEFS:
        doc.textureDefs = readTextureDefs(reader);
        break;
      case GZSTATE_SECTION.FLAT_NAMES:
        doc.flatNames = readStringIndexList(reader);
        break;
      case GZSTATE_SECTION.SPRITE_NAMES:
        doc.spriteNames = readStringIndexList(reader);
        break;
      case GZSTATE_SECTION.MUSIC_NAMES:
        doc.musicNames = readStringIndexList(reader);
        break;
      case GZSTATE_SECTION.SOUND_NAMES:
        doc.soundNames = readStringIndexList(reader);
        break;
      case GZSTATE_SECTION.PNAMES:
        doc.pnames = readStringIndexList(reader);
        break;
      case GZSTATE_SECTION.PATCH_RASTERS:
        doc.patchRasters = readRasterDigests(reader);
        break;
      case GZSTATE_SECTION.FLAT_RASTERS:
        doc.flatRasters = readRasterDigests(reader);
        break;
      case GZSTATE_SECTION.SPRITE_RASTERS:
        doc.spriteRasters = readRasterDigests(reader);
        break;
      case GZSTATE_SECTION.TEXTURE_RASTERS:
        doc.textureRasters = readRasterDigests(reader);
        break;
      case GZSTATE_SECTION.MAP_META:
        break;
      default:
        break;
    }
  }

  return doc;
}

export function readGzstateFile(bytes: Uint8Array): GzstateDocument {
  return readGzstate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
