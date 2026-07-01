import type { GzstateDocument } from '@hypercrab2000/doom-wad-core';
import { parseClassicThingFlags, parseBlockmapFromArrayBuffer } from '@hypercrab2000/doom-wad-core';

import type { LineDef } from '@/wad/interfaces/LineDef';
import type { Sector } from '@/wad/interfaces/Sector';
import type { SideDef } from '@/wad/interfaces/SideDef';
import type { Thing } from '@/wad/interfaces/Thing';
import type { Vertex } from '@/wad/interfaces/Vertex';
import type { WadMap } from '@/wad/interfaces/WadMap';

import { GZSTATE_NO_SIDE } from '../../../../../gzstate/constants';

function resolveString(doc: GzstateDocument, index: number): string {
  return doc.strings[index] ?? '';
}

function decodeClassicLineFlags(word: number): LineDef['flags'] {
  return {
    impassible: (word & (1 << 0)) !== 0,
    blockMonsters: (word & (1 << 1)) !== 0,
    twoSided: (word & (1 << 2)) !== 0,
    upperUnpegged: (word & (1 << 3)) !== 0,
    lowerUnpegged: (word & (1 << 4)) !== 0,
    secret: (word & (1 << 5)) !== 0,
    blockSound: (word & (1 << 6)) !== 0,
    notOnMap: (word & (1 << 7)) !== 0,
    alreadyOnMap: (word & (1 << 8)) !== 0,
  };
}

function decodeClassicThingFlags(word: number): Thing['flags'] {
  return parseClassicThingFlags(word);
}

function toSignedInt16(value: number): number {
  const word = value & 0xffff;
  return word >= 0x8000 ? word - 0x10000 : word;
}

function gzstateChildToRaw(child: number): number {
  const unsigned = child & 0x80000000 ? (child & 0x7fff) | 0x8000 : child & 0xffff;
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
}

function sideIndex(side: number): number {
  return side === GZSTATE_NO_SIDE ? -1 : side;
}

/** Build a WadMap-shaped geometry graph from a parsed GZSTATE document (no WAD re-parse). */
export function gzstateToWadMap(doc: GzstateDocument): WadMap {
  const VERTEXES: Vertex[] = doc.vertices.map((v) => ({ x: v.x, y: v.y }));

  const SECTORS: Sector[] = doc.sectors.map((s) => ({
    floorheight: s.floorHeight,
    ceilingheight: s.ceilingHeight,
    floorpic: resolveString(doc, s.floorTextureIndex),
    ceilingpic: resolveString(doc, s.ceilingTextureIndex),
    lightlevel: s.lightLevel,
    type: s.special,
    tag: s.tag,
  }));

  const SIDEDEFS: SideDef[] = doc.sidedefs.map((s) => ({
    xOffset: s.textureOffsetX,
    yOffset: s.textureOffsetY,
    topTexture: resolveString(doc, s.topTextureIndex),
    bottomTexture: resolveString(doc, s.bottomTextureIndex),
    midTexture: resolveString(doc, s.midTextureIndex),
    sector: s.sectorIndex,
  }));

  const LINEDEFS: LineDef[] = doc.linedefs.map((line) => {
    const def: LineDef = {
      v1: line.vertex1,
      v2: line.vertex2,
      special: toSignedInt16(line.special),
      tag: line.tag,
      sidenum: [sideIndex(line.side0), sideIndex(line.side1)] as [number, number],
      flags: decodeClassicLineFlags(line.flags),
      rawFlags: line.flags,
    };
    if (line.args[1]) def.arg1 = line.args[1];
    if (line.args[2]) def.arg2 = line.args[2];
    if (line.args[3]) def.arg3 = line.args[3];
    if (line.args[4]) def.arg4 = line.args[4];
    if (line.args[5]) def.arg5 = line.args[5];
    return def;
  });

  const THINGS: Thing[] = doc.things.map((t) => ({
    x: t.x,
    y: t.y,
    angle: t.angle,
    type: t.type,
    flags: decodeClassicThingFlags(t.flags),
  }));

  const SEGS = doc.segs.map((seg) => ({
    v1: seg.vertex1,
    v2: seg.vertex2,
    angle: seg.angle,
    linedef: seg.linedef === GZSTATE_NO_SIDE ? -1 : seg.linedef,
    side: seg.side,
    offset: seg.offset,
  }));

  const SSECTORS = doc.subsectors.map((sub) => ({
    numsegs: sub.numSegs,
    firstseg: sub.firstSeg,
  }));

  const NODES = doc.nodes.map((node) => ({
    x: node.x,
    y: node.y,
    dx: node.dx,
    dy: node.dy,
    bbox: [
      [node.bbox[0]!, node.bbox[1]!, node.bbox[2]!, node.bbox[3]!],
      [node.bbox[4]!, node.bbox[5]!, node.bbox[6]!, node.bbox[7]!],
    ] as [[number, number, number, number], [number, number, number, number]],
    children: [gzstateChildToRaw(node.child0), gzstateChildToRaw(node.child1)] as [number, number],
  }));

  const map: WadMap = {
    THINGS,
    VERTEXES,
    LINEDEFS,
    SIDEDEFS,
    SECTORS,
    SEGS,
    SSECTORS,
    NODES,
  };

  if (doc.mapReject) {
    map.REJECT = doc.mapReject;
  }
  if (doc.mapBlockmapRaw) {
    map.BLOCKMAP_RAW = doc.mapBlockmapRaw;
    map.BLOCKMAP = parseBlockmapFromArrayBuffer(doc.mapBlockmapRaw);
  } else if (doc.mapBlockmap) {
    map.BLOCKMAP = doc.mapBlockmap;
  }

  return map;
}
