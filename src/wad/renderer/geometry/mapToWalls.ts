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
    center: [(v1.x + v2.x) / 2, (bottom + top) / 2, -(v1.y + v2.y) / 2],
    repeatVertical,
  };
};

const resolveTexName = (str: string): string | undefined => {
  return str !== '-' ? str : undefined;
};

const resolveSolidTexName = (
  strs: Array<string>,
  texturesByName: Record<string, WallTexture>
): string | undefined => {
  for (let i = 0; i < strs.length; i++) {
    const texName = resolveTexName(strs[i]);

    if (texName && !texturesByName[texName].transparent) {
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
  const v1 = map.VERTEXES[lineDef.v1];
  const v2 = map.VERTEXES[lineDef.v2];
  const side = map.SIDEDEFS[sideDef];
  const sector = map.SECTORS[side.sector];
  const sectorIndex = side.sector;

  let bottom = sector.floorheight;
  let top = sector.ceilingheight;

  const walls = new Array<WallObject>();

  if (otherSideDef === -1) {
    if (resolveTexName(side.midTexture)) {
      walls.push({
        sector,
        sectorIndex,
        texName: side.midTexture,
        ...createWall({
          v1,
          v2,
          bottom,
          top,
          inverse,
          side,
          texSize: texturesByName[side.midTexture],
          drawFromTop: !lineDef.flags.lowerUnpegged,
        }),
      });
    } else if (resolveTexName(side.bottomTexture)) {
      walls.push({
        sector,
        sectorIndex,
        texName: side.bottomTexture,
        ...createWall({
          v1,
          v2,
          bottom,
          top,
          inverse,
          side,
          texSize: texturesByName[side.bottomTexture],
          drawFromTop: !lineDef.flags.lowerUnpegged,
        }),
      });
    } else if (resolveTexName(side.topTexture)) {
      walls.push({
        sector,
        sectorIndex,
        texName: side.topTexture,
        ...createWall({
          v1,
          v2,
          bottom,
          top,
          inverse,
          side,
          texSize: texturesByName[side.topTexture],
          drawFromTop: lineDef.flags.upperUnpegged,
        }),
      });
    }

    return walls;
  }

  const otherSide = map.SIDEDEFS[otherSideDef];
  const otherSector = map.SECTORS[otherSide.sector];

  //TODO: if the sector ceiling height is lower than the other sector this ceiling is lower and there are no side-textures we need to place some sky
  if (resolveTexName(side.midTexture)) {
    const midBottom = Math.max(sector.floorheight, otherSector.floorheight);
    const midTop = Math.min(sector.ceilingheight, otherSector.ceilingheight);

    walls.push({
      sector,
      sectorIndex,
      texName: side.midTexture,
      transparent: texturesByName[side.midTexture].transparent,
      twoSidedMiddle: true,
      repeatVertical: false,
      ...createWall({
        v1,
        v2,
        bottom: midBottom,
        top: midTop,
        inverse,
        side,
        texSize: texturesByName[side.midTexture],
        // Doom two-sided midtextures (doors) are bottom-pegged to the linedef floor.
        drawFromTop: lineDef.flags.upperUnpegged,
        repeatVertical: false,
      }),
    });
  }

  const lowerWallBottom = Math.min(sector.floorheight, otherSector.floorheight);
  const lowerWallTop = Math.max(sector.floorheight, otherSector.floorheight);
  if (lowerWallTop > lowerWallBottom) {
    const tex = resolveSolidTexName(
      [
        side.bottomTexture,
        side.topTexture,
        side.midTexture,
        otherSide.bottomTexture,
        otherSide.topTexture,
        otherSide.midTexture,
        defaultWall,
      ],
      texturesByName
    );

    if (tex) {
      //for lower unpegged walls, need additional offset so the texture aligns with the wall height
      const bottomStart = lineDef.flags.lowerUnpegged
        ? (top - bottom - texturesByName[tex].height) / texturesByName[tex].height
        : 0;

      walls.push({
        sector,
        sectorIndex,
        texName: tex,
        ...createWall({
          v1,
          v2,
          bottom: lowerWallBottom,
          top: lowerWallTop,
          inverse,
          side,
          texSize: texturesByName[tex],
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
    upperWallTop > upperWallBottom &&
    (!sectorHasSky || !otherSectorHasSky)
  ) {
    const tex = resolveSolidTexName(
      [
        side.topTexture,
        side.bottomTexture,
        side.midTexture,
        otherSide.topTexture,
        otherSide.bottomTexture,
        otherSide.midTexture,
        defaultWall,
      ],
      texturesByName
    );

    if (tex) {
      walls.push({
        sector,
        sectorIndex,
        texName: tex,
        ...createWall({
          v1,
          v2,
          bottom: upperWallBottom,
          top: upperWallTop,
          inverse,
          side,
          texSize: texturesByName[tex],
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
