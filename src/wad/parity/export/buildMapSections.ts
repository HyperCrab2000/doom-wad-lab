import { GZSTATE_NO_SIDE } from '../../../../gzstate/constants';
import { internString } from '../../../../gzstate/gzstateWriter';
import type {
  GzstateLineDef,
  GzstateNode,
  GzstateSector,
  GzstateSeg,
  GzstateSideDef,
  GzstateSubsector,
  GzstateThing,
  GzstateVertex,
} from '../../../../gzstate/types';
import type { Node } from '@/wad/interfaces/Node';
import type { WadMap } from '@/wad/interfaces/WadMap';

import { encodeClassicLineFlags, encodeClassicThingFlags, nodeChildToGzstate } from '../encodeDoomFormats';

function sideIndex(side: number): number {
  return side >= 0 ? side : GZSTATE_NO_SIDE;
}

export function buildVertices(map: WadMap): GzstateVertex[] {
  return map.VERTEXES.map((v) => ({ x: v.x, y: v.y }));
}

export function buildSectors(map: WadMap, strings: string[]): GzstateSector[] {
  return map.SECTORS.map((sec) => ({
    floorHeight: sec.floorheight,
    ceilingHeight: sec.ceilingheight,
    lightLevel: sec.lightlevel,
    special: sec.type,
    tag: sec.tag,
    floorTextureIndex: internString(strings, sec.floorpic.toUpperCase()),
    ceilingTextureIndex: internString(strings, sec.ceilingpic.toUpperCase()),
    flags: 0,
  }));
}

export function buildSidedefs(map: WadMap, strings: string[]): GzstateSideDef[] {
  return map.SIDEDEFS.map((side) => ({
    textureOffsetX: side.xOffset,
    textureOffsetY: side.yOffset,
    topTextureIndex: internString(strings, side.topTexture.toUpperCase() || '-'),
    bottomTextureIndex: internString(strings, side.bottomTexture.toUpperCase() || '-'),
    midTextureIndex: internString(strings, side.midTexture.toUpperCase() || '-'),
    sectorIndex: side.sector,
  }));
}

export function buildLinedefs(map: WadMap): GzstateLineDef[] {
  return map.LINEDEFS.map((line) => ({
    vertex1: line.v1,
    vertex2: line.v2,
    flags: line.rawFlags ?? encodeClassicLineFlags(line.flags),
    flags2: 0,
    special: line.special,
    side0: sideIndex(line.sidenum[0]),
    side1: sideIndex(line.sidenum[1]),
    tag: line.tag ?? 0,
    activation: 0,
    args: [line.tag ?? 0, line.arg1 ?? 0, line.arg2 ?? 0, line.arg3 ?? 0, line.arg4 ?? 0],
  }));
}

export function buildSegs(map: WadMap): GzstateSeg[] {
  const segs = map.SEGS as Array<{ v1: number; v2: number; angle: number; linedef: number; side: number; offset: number }> | undefined;
  if (!segs) return [];
  return segs.map((seg) => ({
    vertex1: seg.v1,
    vertex2: seg.v2,
    angle: seg.angle,
    linedef: seg.linedef >= 0 ? seg.linedef : GZSTATE_NO_SIDE,
    side: seg.side,
    offset: seg.offset,
  }));
}

export function buildSubsectors(map: WadMap): GzstateSubsector[] {
  const subs = map.SSECTORS as Array<{ numsegs: number; firstseg: number }> | undefined;
  if (!subs) return [];
  return subs.map((sub) => ({
    numSegs: sub.numsegs,
    firstSeg: sub.firstseg,
    sectorIndex: 0,
    flags: 0,
  }));
}

export function buildNodes(map: WadMap): GzstateNode[] {
  const nodes = map.NODES as Node[] | undefined;
  if (!nodes) return [];
  return nodes.map((node) => ({
    x: node.x,
    y: node.y,
    dx: node.dx,
    dy: node.dy,
    bbox: Int16Array.from(node.bbox.flat()),
    child0: nodeChildToGzstate(node.children[0]),
    child1: nodeChildToGzstate(node.children[1]),
  }));
}

export function buildThings(map: WadMap): GzstateThing[] {
  return map.THINGS.map((thing) => ({
    x: thing.x,
    y: thing.y,
    z: 0,
    angle: thing.angle,
    type: thing.type,
    flags: encodeClassicThingFlags(thing.flags),
    tid: 0,
  }));
}
