import { vec3 } from 'gl-matrix';

import { skyFlats } from '@/wad/constants/WadInfo';

import { WallObject } from '@/wad/interfaces/WallObject';
import { LineDef } from '@/wad/interfaces/LineDef';
import { WadMap } from '@/wad/interfaces/WadMap';
import { SideDef } from '@/wad/interfaces/SideDef';
import { Vertex } from '@/wad/interfaces/Vertex';
import { WallTexture } from '@/wad/interfaces/WallTexture';

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

/** Avoid upper/lower wall segments flickering on/off while door ceilings move. */
const WALL_VISIBILITY_EPS = 1;

/** Extend wall quads along the linedef to hide sub-texel gaps at corners (E1M2, etc.). */
const LINE_ENDPOINT_OVERLAP = 0.75;

/** Overlap upper/lower/mid wall bands at two-sided lines (door frames). */
const WALL_JOINT_OVERLAP = 1;

const resolveTexName = (str: string): string | undefined => {
  return str !== '-' ? str : undefined;
};

const resolveSolidTexName = (
  strs: Array<string>,
  texturesByName: Record<string, WallTexture>
): string | undefined => {
  for (let i = 0; i < strs.length; i++) {
    const texName = resolveTexName(strs[i]);
    const texDef = texName ? texturesByName[texName] : undefined;
    if (texDef && !texDef.transparent) {
      return texName;
    }
  }
};

const procesSideDef = (
  map: WadMap,
  sideDef: number,
  otherSideDef: number,
  lineDef: LineDef,
  texturesByName: Record<string, WallTexture>,
  inverse: boolean,
  defaultWall: string
): Array<WallObject> => {
  const rawV1 = map.VERTEXES[lineDef.v1];
  const rawV2 = map.VERTEXES[lineDef.v2];
  const { v1, v2 } = extendLineEndpoints(rawV1, rawV2, LINE_ENDPOINT_OVERLAP);
  const side = map.SIDEDEFS[sideDef];
  const sector = map.SECTORS[side.sector];
  const sectorIndex = side.sector;

  let bottom = sector.floorheight;
  let top = sector.ceilingheight;

  const walls = new Array<WallObject>();

  if (otherSideDef === -1) {
    const oneSidedTex =
      resolveTexName(side.midTexture) ??
      resolveTexName(side.bottomTexture) ??
      resolveTexName(side.topTexture);
    const oneSidedTexDef = oneSidedTex ? texturesByName[oneSidedTex] : undefined;
    if (oneSidedTex && oneSidedTexDef) {
      walls.push({
        sector,
        sectorIndex,
        texName: oneSidedTex,
        ...createWall({
          v1,
          v2,
          bottom,
          top,
          inverse,
          side,
          texSize: oneSidedTexDef,
          drawFromTop: !lineDef.flags.lowerUnpegged,
        }),
      });
    }

    return walls;
  }

  const otherSide = map.SIDEDEFS[otherSideDef];
  const otherSector = map.SECTORS[otherSide.sector];

  const hasMidTexture = Boolean(resolveTexName(side.midTexture));

  //TODO: if the sector ceiling height is lower than the other sector this ceiling is lower and there are no side-textures we need to place some sky
  if (hasMidTexture) {
    const midTexDef = texturesByName[side.midTexture];
    if (midTexDef) {
      const midBottom = Math.max(sector.floorheight, otherSector.floorheight);
      const midTop = Math.min(sector.ceilingheight, otherSector.ceilingheight);
      if (midTop > midBottom + WALL_VISIBILITY_EPS) {
        walls.push({
          sector,
          sectorIndex,
          texName: side.midTexture,
          transparent: midTexDef.transparent,
          twoSidedMiddle: true,
          repeatVertical: false,
          ...createWall({
            v1,
            v2,
            bottom: midBottom - WALL_JOINT_OVERLAP,
            top: midTop + WALL_JOINT_OVERLAP,
            inverse,
            side,
            texSize: midTexDef,
            // Doom two-sided midtextures (doors) are bottom-pegged to the linedef floor.
            drawFromTop: lineDef.flags.upperUnpegged,
            repeatVertical: false,
          }),
        });
      }
    }
  }

  const lowerWallBottom = Math.min(sector.floorheight, otherSector.floorheight);
  const lowerWallTop = Math.max(sector.floorheight, otherSector.floorheight);
  if (lowerWallTop > lowerWallBottom + WALL_VISIBILITY_EPS) {
    // GZDoom: lower wall only renders when bottomTexture is explicitly set (not '-').
    // Never fall back to other slots — a missing bottom texture means transparent gap.
    const tex = resolveTexName(side.bottomTexture);
    const texDef = tex ? texturesByName[tex] : undefined;

    if (tex && texDef) {
      const bottomStart = lineDef.flags.lowerUnpegged
        ? (top - bottom - texDef.height) / texDef.height
        : 0;

      walls.push({
        sector,
        sectorIndex,
        texName: tex,
        ...createWall({
          v1,
          v2,
          bottom: lowerWallBottom - WALL_JOINT_OVERLAP,
          top: lowerWallTop + WALL_JOINT_OVERLAP,
          inverse,
          side,
          texSize: texDef,
          drawFromTop: !lineDef.flags.lowerUnpegged,
          bottomStart: -bottomStart,
        }),
      });
    }
  }

  const upperWallBottom = Math.min(sector.ceilingheight, otherSector.ceilingheight);
  const upperWallTop = Math.max(sector.ceilingheight, otherSector.ceilingheight);
  const sectorHasSky = skyFlats.indexOf(sector.ceilingpic) >= 0;
  const otherSectorHasSky = skyFlats.indexOf(otherSector.ceilingpic) >= 0;
  if (
    upperWallTop > upperWallBottom + WALL_VISIBILITY_EPS &&
    (!sectorHasSky || !otherSectorHasSky)
  ) {
    // GZDoom: upper wall only renders when topTexture is explicitly set (not '-').
    const tex = resolveTexName(side.topTexture);
    const texDef = tex ? texturesByName[tex] : undefined;

    if (tex && texDef) {
      walls.push({
        sector,
        sectorIndex,
        texName: tex,
        ...createWall({
          v1,
          v2,
          bottom: upperWallBottom - WALL_JOINT_OVERLAP,
          top: upperWallTop + WALL_JOINT_OVERLAP,
          inverse,
          side,
          texSize: texDef,
          drawFromTop: lineDef.flags.upperUnpegged,
        }),
      });
    }
  } else if (
    upperWallTop > upperWallBottom + WALL_VISIBILITY_EPS &&
    sectorHasSky &&
    otherSectorHasSky &&
    sector.floorheight === otherSector.floorheight &&
    sector.ceilingheight < otherSector.ceilingheight
  ) {
    // GZDoom HWWall: short sky-sector step when back ceiling is higher (courtyard edges).
    // Only render if there is an explicit top texture; sky-sky transitions with no top
    // texture are handled by the sky portal (seamless sky above the short wall).
    const tex = resolveTexName(side.topTexture);
    const texDef = tex ? texturesByName[tex] : undefined;

    if (tex && texDef) {
      walls.push({
        sector,
        sectorIndex,
        texName: tex,
        ...createWall({
          v1,
          v2,
          bottom: sector.ceilingheight,
          top: otherSector.ceilingheight,
          inverse,
          side,
          texSize: texDef,
          drawFromTop: lineDef.flags.upperUnpegged,
        }),
      });
    }
  }

  return walls;
};

function resolveDefaultWall(texturesByName: Record<string, WallTexture>): string {
  return 'BLAKWAL1' in texturesByName ? 'BLAKWAL1' : firstObjectKey(texturesByName)!;
}

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
