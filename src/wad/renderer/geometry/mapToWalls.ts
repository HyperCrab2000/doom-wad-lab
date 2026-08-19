import { vec3 } from 'gl-matrix';

import { WallObject } from '@/wad/interfaces/WallObject';
import { LineDef } from '@/wad/interfaces/LineDef';
import { WadMap } from '@/wad/interfaces/WadMap';
import { SideDef } from '@/wad/interfaces/SideDef';
import { Vertex } from '@/wad/interfaces/Vertex';
import { WallTexture } from '@/wad/interfaces/WallTexture';

import { hwWallProcessSide } from '@/wad/renderer/bsp/hwWallProcess';
import { firstObjectKey } from '@/wad/utils/firstObjectKey';

interface CreateWallProps {
  v1: Vertex;
  v2: Vertex;
  bottom: number;
  top: number;
  inverse: boolean;
  side: SideDef;
  texSize: WallTexture;
  drawFromTop?: boolean;
  bottomStart?: number;
  /** Doom tiles midtextures horizontally only; solid walls tile both axes. */
  repeatVertical?: boolean;
}

const createWall = (props: CreateWallProps): WallObject => {
  const {
    v1,
    v2,
    bottom,
    top,
    inverse,
    side,
    texSize,
    drawFromTop,
    bottomStart,
    repeatVertical = true,
  } = props;

  const wallPositions = new Array<number>();
  const wallUvs = new Array<number>();
  const wallNormals = new Array<number>();
  const wallIndices = new Array<number>();
  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = (inverse ? -dy : dy) / length;
  const normalZ = (inverse ? -dx : dx) / length;

  wallPositions.splice(
    wallPositions.length,
    0,
    v1.x,
    bottom,
    -v1.y, //bottom left
    v2.x,
    bottom,
    -v2.y, //bottom right
    v1.x,
    top,
    -v1.y, //top left
    v2.x,
    top,
    -v2.y //top right
  );

  wallNormals.splice(
    wallNormals.length,
    0,
    normalX,
    0,
    normalZ,
    normalX,
    0,
    normalZ,
    normalX,
    0,
    normalZ,
    normalX,
    0,
    normalZ
  );

  const wallWidth = vec3.distance([v1.x, bottom, -v1.y], [v2.x, bottom, -v2.y]) / texSize.width;
  const physicalHeight = (top - bottom) / texSize.height;
  const uvHeight = repeatVertical ? physicalHeight : Math.min(physicalHeight, 1);

  const center: [number, number, number] = [(v1.x + v2.x) / 2, (bottom + top) / 2, -(v1.y + v2.y) / 2];
  const corners: Array<[number, number, number]> = [
    [v1.x, bottom, -v1.y],
    [v2.x, bottom, -v2.y],
    [v1.x, top, -v1.y],
    [v2.x, top, -v2.y],
  ];
  let boundsRadius = 0;
  for (const corner of corners) {
    boundsRadius = Math.max(
      boundsRadius,
      Math.hypot(corner[0] - center[0], corner[1] - center[1], corner[2] - center[2])
    );
  }

  let offsetX = side.xOffset / texSize.width,
    offsetY = side.yOffset / texSize.height;

  if (!drawFromTop) {
    offsetY += 1 - uvHeight - (bottomStart || 0);
  }

  let posIndex = 0;

  if (inverse) {
    wallUvs.splice(
      wallUvs.length,
      0,
      offsetX + wallWidth,
      offsetY + uvHeight,
      offsetX,
      offsetY + uvHeight,
      offsetX + wallWidth,
      offsetY,
      offsetX,
      offsetY
    );

    wallIndices.splice(
      wallIndices.length,
      0,
      posIndex + 2,
      posIndex + 1,
      posIndex,
      posIndex + 3,
      posIndex + 1,
      posIndex + 2
    );
  } else {
    wallUvs.splice(
      wallUvs.length,
      0,
      offsetX,
      offsetY + uvHeight,
      offsetX + wallWidth,
      offsetY + uvHeight,
      offsetX,
      offsetY,
      offsetX + wallWidth,
      offsetY
    );

    wallIndices.splice(
      wallIndices.length,
      0,
      posIndex,
      posIndex + 1,
      posIndex + 2,
      posIndex + 2,
      posIndex + 1,
      posIndex + 3
    );
  }

  return {
    position: new Float32Array(wallPositions),
    uv: new Float32Array(wallUvs),
    normal: new Float32Array(wallNormals),
    indices: new Uint16Array(wallIndices),
    center,
    boundsRadius,
    repeatVertical,
  };
};

function extendLineEndpoints(v1: Vertex, v2: Vertex, overlap: number): { v1: Vertex; v2: Vertex } {
  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { v1, v2 };
  const nx = dx / len;
  const ny = dy / len;
  return {
    v1: { x: v1.x - nx * overlap, y: v1.y - ny * overlap },
    v2: { x: v2.x + nx * overlap, y: v2.y + ny * overlap },
  };
}

/** Extend wall quads along the linedef to hide sub-texel gaps at corners (E1M2, etc.). */
export const LINE_ENDPOINT_OVERLAP = 0.75;

/** Overlap upper/lower/mid wall bands at two-sided lines (door frames). */
const WALL_JOINT_OVERLAP = 1;

function resolveDefaultWall(texturesByName: Record<string, WallTexture>): string {
  return 'BLAKWAL1' in texturesByName ? 'BLAKWAL1' : firstObjectKey(texturesByName)!;
}

const procesSideDef = (
  map: WadMap,
  sideDef: number,
  otherSideDef: number,
  lineDef: LineDef,
  texturesByName: Record<string, WallTexture>,
  inverse: boolean,
  defaultWall: string,
): Array<WallObject> => {
  const bands = hwWallProcessSide({
    map,
    lineDef,
    sideDefIndex: sideDef,
    otherSideDefIndex: otherSideDef,
    texturesByName,
    defaultWall,
  });

  const rawV1 = map.VERTEXES[lineDef.v1];
  const rawV2 = map.VERTEXES[lineDef.v2];
  if (!rawV1 || !rawV2) return [];
  const { v1, v2 } = extendLineEndpoints(rawV1, rawV2, LINE_ENDPOINT_OVERLAP);
  const side = map.SIDEDEFS[sideDef];
  if (!side) return [];

  const walls: WallObject[] = [];
  for (const band of bands) {
    const texDef = texturesByName[band.texName];
    if (!texDef) continue;
    const joint = band.part === 'mid' ? 0 : WALL_JOINT_OVERLAP;
    walls.push({
      sector: band.sector,
      sectorIndex: band.sectorIndex,
      texName: band.texName,
      transparent: band.transparent,
      twoSidedMiddle: band.twoSidedMiddle,
      repeatVertical: band.repeatVertical,
      ...createWall({
        v1,
        v2,
        bottom: band.bottom - joint,
        top: band.top + joint,
        inverse,
        side,
        texSize: texDef,
        drawFromTop: band.drawFromTop,
        bottomStart: band.bottomStart,
        repeatVertical: band.repeatVertical,
      }),
    });
  }
  return walls;
};

export function mapToWallsForLine(
  map: WadMap,
  texturesByName: Record<string, WallTexture>,
  lineIndex: number,
  defaultWall?: string
): WallObject[] {
  const lineDef = map.LINEDEFS[lineIndex];
  if (!lineDef) return [];

  const fallbackWall = defaultWall ?? resolveDefaultWall(texturesByName);
  const walls: WallObject[] = [];

  const sideResults = procesSideDef(
    map,
    lineDef.sidenum[0],
    lineDef.sidenum[1],
    lineDef,
    texturesByName,
    false,
    fallbackWall
  );
  for (const wall of sideResults) {
    wall.lineIndex = lineIndex;
    wall.sideDefIndex = lineDef.sidenum[0];
    walls.push(wall);
  }

  if (lineDef.sidenum[1] !== -1) {
    const otherSideResults = procesSideDef(
      map,
      lineDef.sidenum[1],
      lineDef.sidenum[0],
      lineDef,
      texturesByName,
      true,
      fallbackWall
    );
    for (const wall of otherSideResults) {
      wall.lineIndex = lineIndex;
      wall.sideDefIndex = lineDef.sidenum[1];
      walls.push(wall);
    }
  }

  return walls;
}

export const mapToWalls = (
  map: WadMap,
  texturesByName: Record<string, WallTexture>
): Array<WallObject> => {
  const walls = new Array<WallObject>();
  const defaultWall = resolveDefaultWall(texturesByName);

  map.LINEDEFS.forEach((_lineDef, lineIndex) => {
    walls.push(...mapToWallsForLine(map, texturesByName, lineIndex, defaultWall));
  });

  return walls;
};
