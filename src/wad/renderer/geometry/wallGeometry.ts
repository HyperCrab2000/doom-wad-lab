import { vec3 } from 'gl-matrix';

import type { SideDef } from '@/wad/interfaces/SideDef';
import type { Vertex } from '@/wad/interfaces/Vertex';
import type { WallObject } from '@/wad/interfaces/WallObject';
import type { WallTexture } from '@/wad/interfaces/WallTexture';

export interface CreateWallProps {
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

export const createWall = (props: CreateWallProps): WallObject => {
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
    -v1.y,
    v2.x,
    bottom,
    -v2.y,
    v1.x,
    top,
    -v1.y,
    v2.x,
    top,
    -v2.y
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

  const posIndex = 0;

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

/** Avoid upper/lower wall segments flickering on/off while door ceilings move. */
export const WALL_VISIBILITY_EPS = 1;

/** Extend wall quads below the floor plane to hide flat/wall seams (liquid wave verts dip below floorheight). */
export const WALL_FLOOR_SKIRT = 8;

/** Max downward dip from flat.vert liquid waves: 2 * liquidStrength * 1.2. */
export const LIQUID_FLOOR_WAVE_DIP = 2.4;

export function skirtFloorBottom(bottom: number, top: number): number {
  if (top <= bottom + WALL_VISIBILITY_EPS) return bottom;
  return bottom - WALL_FLOOR_SKIRT;
}
