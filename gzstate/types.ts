export interface GzstateHeader {
  magic: number;
  version: number;
  flags: number;
  headerSize: number;
  sectionCount: number;
  sectionDirectoryOffset: number;
  mapName: string;
  engineTag: string;
}

export interface GzstateSectionEntry {
  sectionId: number;
  offset: number;
  byteSize: number;
  crc32: number;
}

export interface GzstateVertex {
  x: number;
  y: number;
}

export interface GzstateSector {
  floorHeight: number;
  ceilingHeight: number;
  lightLevel: number;
  special: number;
  tag: number;
  floorTextureIndex: number;
  ceilingTextureIndex: number;
  flags: number;
}

export interface GzstateSideDef {
  textureOffsetX: number;
  textureOffsetY: number;
  topTextureIndex: number;
  bottomTextureIndex: number;
  midTextureIndex: number;
  sectorIndex: number;
}

export interface GzstateLineDef {
  vertex1: number;
  vertex2: number;
  flags: number;
  flags2: number;
  special: number;
  side0: number;
  side1: number;
  tag: number;
  activation: number;
  args: [number, number, number, number, number];
}

export interface GzstateSeg {
  vertex1: number;
  vertex2: number;
  angle: number;
  linedef: number;
  side: number;
  offset: number;
}

export interface GzstateSubsector {
  numSegs: number;
  firstSeg: number;
  sectorIndex: number;
  flags: number;
}

export interface GzstateNode {
  x: number;
  y: number;
  dx: number;
  dy: number;
  bbox: Int16Array;
  child0: number;
  child1: number;
}

export interface GzstateThing {
  x: number;
  y: number;
  z: number;
  angle: number;
  type: number;
  flags: number;
  tid: number;
}

export interface GzstateLumpCatalogEntry {
  nameIndex: number;
  byteLength: number;
  crc32: number;
  category: number;
}

export interface GzstateTexturePatch {
  originX: number;
  originY: number;
  patchIndex: number;
}

export interface GzstateTextureDef {
  nameIndex: number;
  width: number;
  height: number;
  patches: GzstateTexturePatch[];
}

export interface GzstateDocument {
  header: GzstateHeader;
  sections: GzstateSectionEntry[];
  strings: string[];
  vertices: GzstateVertex[];
  sectors: GzstateSector[];
  sidedefs: GzstateSideDef[];
  linedefs: GzstateLineDef[];
  segs: GzstateSeg[];
  subsectors: GzstateSubsector[];
  nodes: GzstateNode[];
  things: GzstateThing[];
  lumpCatalog: GzstateLumpCatalogEntry[];
  textureDefs: GzstateTextureDef[];
  flatNames: number[];
  spriteNames: number[];
  musicNames: number[];
  soundNames: number[];
  pnames: number[];
  patchRasters: GzstateRasterDigest[];
  flatRasters: GzstateRasterDigest[];
  spriteRasters: GzstateRasterDigest[];
  textureRasters: GzstateRasterDigest[];
}

export interface GzstateRasterDigest {
  nameIndex: number;
  kind: number;
  width: number;
  height: number;
  rgbaCrc32: number;
}

export interface GzstateFieldDiff {
  path: string;
  left: unknown;
  right: unknown;
}

export interface GzstateSectionDiff {
  sectionId: number;
  sectionName: string;
  leftCount: number;
  rightCount: number;
  fieldDiffs: GzstateFieldDiff[];
}

export interface GzstateDiffResult {
  identical: boolean;
  headerDiffs: GzstateFieldDiff[];
  sectionDiffs: GzstateSectionDiff[];
}
