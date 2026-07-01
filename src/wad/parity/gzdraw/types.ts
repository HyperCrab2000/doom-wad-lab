export interface GzdrawHeader {
  magic: number;
  version: number;
  flags: number;
  headerSize: number;
  sectionCount: number;
  sectionDirectoryOffset: number;
  mapName: string;
  probeId: number;
}

export interface GzdrawSectionEntry {
  sectionId: number;
  offset: number;
  byteSize: number;
  crc32: number;
}

export interface GzdrawCamera {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  yawBam: number;
}

export interface GzdrawWallEntry {
  linedef: number;
  side: number;
  segIndex: number;
  sortKey: number;
  flags: number;
}

export interface GzdrawSpriteEntry {
  thingIndex: number;
  spriteFrame: number;
  sortKey: number;
  flags: number;
}

export interface GzdrawPortalClipLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  portalId: number;
  flags: number;
}

export interface GzdrawPortalSnapshot {
  stackDepth: number;
  clipCount: number;
  clips: GzdrawPortalClipLine[];
}

export interface GzdrawFlatEntry {
  subsectorIndex: number;
  sectorIndex: number;
  sortKey: number;
}

export interface GzdrawDrawMeta {
  flatDrawMode: number;
  wallCount: number;
  spriteCount: number;
  subsectorCount: number;
  engineTag: string;
}

export interface GzdrawDocument {
  header: GzdrawHeader;
  sections: GzdrawSectionEntry[];
  camera: GzdrawCamera | null;
  subsectors: number[];
  sectors: number[];
  walls: GzdrawWallEntry[];
  sprites: GzdrawSpriteEntry[];
  portalSnapshot: GzdrawPortalSnapshot | null;
  flats: GzdrawFlatEntry[];
  drawMeta: GzdrawDrawMeta | null;
}

export interface GzdrawFieldDiff {
  path: string;
  left: unknown;
  right: unknown;
}

export interface GzdrawSectionDiff {
  sectionId: number;
  sectionName: string;
  leftCount: number;
  rightCount: number;
  fieldDiffs: GzdrawFieldDiff[];
}

export interface GzdrawMissingSection {
  side: 'left' | 'right';
  typeId: number;
  sectionName: string;
}

export interface GzdrawDiffResult {
  identical: boolean;
  headerDiffs: GzdrawFieldDiff[];
  missingSections: GzdrawMissingSection[];
  sectionDiffs: GzdrawSectionDiff[];
}
