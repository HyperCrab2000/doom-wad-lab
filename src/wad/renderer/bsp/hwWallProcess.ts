import type { LineDef } from '@/wad/interfaces/LineDef';
import type { Sector } from '@/wad/interfaces/Sector';
import type { SideDef } from '@/wad/interfaces/SideDef';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { WallTexture } from '@/wad/interfaces/WallTexture';

import { FakeFlatArea, hwFakeFlat, isSkyFlat } from '@/wad/renderer/bsp/hwFakeFlat';
import { skirtFloorBottom, WALL_VISIBILITY_EPS } from '@/wad/renderer/geometry/wallGeometry';

export type HwWallPart = 'onesided' | 'upper' | 'mid' | 'lower';

/** One drawable wall band from `HWWall::Process` / `DoTexture`. */
export interface HwWallBand {
  part: HwWallPart;
  texName: string;
  bottom: number;
  top: number;
  drawFromTop: boolean;
  repeatVertical: boolean;
  transparent: boolean;
  twoSidedMiddle: boolean;
  bottomStart?: number;
  sectorIndex: number;
  sector: Sector;
}

export interface HwWallProcessParams {
  map: WadMap;
  lineDef: LineDef;
  sideDefIndex: number;
  otherSideDefIndex: number;
  texturesByName: Record<string, WallTexture>;
  defaultWall?: string;
  drawFullHeight?: boolean;
}

const resolveBandTex = (
  tex: string,
  texturesByName: Record<string, WallTexture>
): string | undefined => {
  const texName = resolveTexName(tex);
  if (texName && texturesByName[texName] && !texturesByName[texName].transparent) {
    return texName;
  }
};

const resolveSolidTexName = (
  strs: Array<string>,
  texturesByName: Record<string, WallTexture>
): string | undefined => {
  for (let i = 0; i < strs.length; i++) {
    const texName = resolveTexName(strs[i]);
    if (texName && texturesByName[texName] && !texturesByName[texName].transparent) {
      return texName;
    }
  }
};

const resolveTexName = (str: string): string | undefined => {
  return str !== '-' ? str : undefined;
};

/** GZDoom `DoMidTexture` top/bottom span for flat sectors (no slopes). */
function computeMidSpan(params: {
  side: SideDef;
  front: ReturnType<typeof hwFakeFlat>;
  back: ReturnType<typeof hwFakeFlat>;
  texHeight: number;
  lowerUnpegged: boolean;
}): { bottom: number; top: number } | null {
  const { side, front, back, texHeight, lowerUnpegged } = params;
  const fch = front.ceilingheight;
  const ffh = front.floorheight;
  const bch = back.ceilingheight;
  const bfh = back.floorheight;

  const hasUpperTex = !!resolveTexName(side.topTexture);
  const hasBottomTex = !!resolveTexName(side.bottomTexture);
  const frontSkyCeil = isSkyFlat(front.ceilingpic);
  const backSkyCeil = isSkyFlat(back.ceilingpic);

  let textureTop: number;
  let textureBottom: number;
  if (lowerUnpegged) {
    textureBottom = Math.max(ffh, bfh) + side.yOffset;
    textureTop = textureBottom + texHeight;
  } else {
    textureTop = Math.min(fch, bch) + side.yOffset;
    textureBottom = textureTop - texHeight;
  }

  let top: number;
  if (!hasUpperTex) {
    if (frontSkyCeil && backSkyCeil) {
      top = textureTop;
    } else {
      top = Math.max(bch, fch);
    }
  } else if (bch > fch && (!frontSkyCeil || backSkyCeil)) {
    top = bch;
  } else {
    top = Math.min(bch, fch);
  }

  let bottom: number;
  if (!hasBottomTex) {
    bottom = Math.min(bfh, ffh);
  } else if (bfh < ffh) {
    bottom = bfh;
  } else {
    bottom = Math.max(bfh, ffh);
  }

  if (textureTop < top) top = textureTop;
  if (textureBottom > bottom) bottom = textureBottom;

  if (top <= bottom + WALL_VISIBILITY_EPS) return null;
  return { bottom, top };
}

/**
 * Port of GZDoom `HWWall::Process` for classic one- and two-sided linedefs
 * (no portals, polyobjects, slopes, or 3D midtex).
 */
export function hwWallProcessSide(params: HwWallProcessParams): HwWallBand[] {
  const { map, lineDef, sideDefIndex, otherSideDefIndex, texturesByName, defaultWall } = params;
  const drawFullHeight = params.drawFullHeight ?? false;

  const side = map.SIDEDEFS[sideDefIndex];
  const front = hwFakeFlat(map.SECTORS[side.sector], FakeFlatArea.normal, false);
  const sector = front.source;
  const sectorIndex = side.sector;

  const ffh = front.floorheight;
  const fch = front.ceilingheight;
  const skirtBottom = skirtFloorBottom(ffh, fch);

  const bands: HwWallBand[] = [];

  const oneSided =
    otherSideDefIndex === -1 ||
    (!lineDef.flags.twoSided && !resolveTexName(side.midTexture));

  if (oneSided) {
    const pushOneSided = (
      texName: string | undefined,
      drawFromTop: boolean,
      part: HwWallPart = 'onesided'
    ) => {
      if (!texName || !texturesByName[texName]) return;
      bands.push({
        part,
        texName,
        bottom: ffh,
        top: fch,
        drawFromTop,
        repeatVertical: true,
        transparent: texturesByName[texName].transparent,
        twoSidedMiddle: false,
        sectorIndex,
        sector,
      });
    };

    if (resolveTexName(side.midTexture)) {
      pushOneSided(side.midTexture, lineDef.flags.lowerUnpegged);
    } else if (resolveTexName(side.bottomTexture)) {
      pushOneSided(side.bottomTexture, lineDef.flags.lowerUnpegged);
    } else if (resolveTexName(side.topTexture)) {
      pushOneSided(side.topTexture, !lineDef.flags.upperUnpegged);
    }
    return bands;
  }

  const otherSide = map.SIDEDEFS[otherSideDefIndex];
  const back = hwFakeFlat(map.SECTORS[otherSide.sector], FakeFlatArea.normal, true);
  let bfh = back.floorheight;
  let bch = back.ceilingheight;

  const midTexName = resolveTexName(side.midTexture);
  if (midTexName && texturesByName[midTexName]) {
    const span = computeMidSpan({
      side,
      front,
      back,
      texHeight: texturesByName[midTexName].height,
      lowerUnpegged: lineDef.flags.lowerUnpegged,
    });
    if (span) {
      bands.push({
        part: 'mid',
        texName: midTexName,
        bottom: span.bottom,
        top: span.top,
        drawFromTop: lineDef.flags.lowerUnpegged,
        repeatVertical: false,
        transparent: texturesByName[midTexName].transparent,
        twoSidedMiddle: true,
        sectorIndex,
        sector,
      });
    }
  }

  let bchA = bch;
  if (!isSkyFlat(front.floorpic) || !isSkyFlat(back.floorpic)) {
    if (ffh > bch && !drawFullHeight) {
      bchA = ffh;
    }
  }

  if (!isSkyFlat(front.ceilingpic) || !isSkyFlat(back.ceilingpic)) {
    if (bchA < fch) {
      const topTex = resolveBandTex(side.topTexture, texturesByName);
      if (topTex) {
        bands.push({
        part: 'upper',
        texName: topTex,
        bottom: bchA,
        top: fch,
        drawFromTop: !lineDef.flags.upperUnpegged,
        repeatVertical: true,
        transparent: false,
        twoSidedMiddle: false,
        sectorIndex,
        sector,
      });
    }
    }
  } else if (
    isSkyFlat(front.ceilingpic) &&
    isSkyFlat(back.ceilingpic) &&
    bfh === ffh &&
    bch > fch &&
    bchA >= fch
  ) {
    // Courtyard short wall: back ceiling above front, same floor (GZDoom sky wall).
    const topTex = resolveSolidTexName(
      [
        side.topTexture,
        side.bottomTexture,
        side.midTexture,
        otherSide.topTexture,
        otherSide.bottomTexture,
        otherSide.midTexture,
        defaultWall ?? '',
      ],
      texturesByName
    );
    if (topTex) {
      bands.push({
        part: 'upper',
        texName: topTex,
        bottom: fch,
        top: bchA,
        drawFromTop: !lineDef.flags.upperUnpegged,
        repeatVertical: true,
        transparent: false,
        twoSidedMiddle: false,
        sectorIndex,
        sector,
      });
    }
  }

  let bfhDraw = bfh;
  if (fch < bfh && !drawFullHeight) {
    bfhDraw = fch;
  }

  if (bfhDraw > ffh) {
    const bottomTex = resolveBandTex(side.bottomTexture, texturesByName);
    if (bottomTex) {
      const bottomStart = lineDef.flags.lowerUnpegged
        ? (fch - skirtBottom - texturesByName[bottomTex].height) / texturesByName[bottomTex].height
        : 0;

      bands.push({
        part: 'lower',
        texName: bottomTex,
        bottom: ffh,
        top: bfhDraw,
        drawFromTop: lineDef.flags.lowerUnpegged,
        repeatVertical: true,
        transparent: false,
        twoSidedMiddle: false,
        bottomStart: -bottomStart,
        sectorIndex,
        sector,
      });
    }
  } else if (bfh === ffh && bch < fch) {
    // Raised platform: lower texture fills floor → back ceiling (E1M1 line 146 STEP6).
    const bottomTex = resolveBandTex(side.bottomTexture, texturesByName);
    if (bottomTex && !bands.some((b) => b.part === 'lower')) {
      bands.push({
        part: 'lower',
        texName: bottomTex,
        bottom: ffh,
        top: bch,
        drawFromTop: lineDef.flags.lowerUnpegged,
        repeatVertical: true,
        transparent: false,
        twoSidedMiddle: false,
        sectorIndex,
        sector,
      });
    }
  }

  // Aligned two-sided lines (same floor/ceiling both sides): GZDoom draws top+bottom
  // texture full height when no upper/lower/mid gap exists (E1M1 line 46 STARTAN3).
  // Skip top-only aligned lines (open crusher doors).
  if (bands.length === 0 && ffh === bfh && fch === bch) {
    const hasTop = Boolean(resolveTexName(side.topTexture));
    const hasBottom = Boolean(resolveTexName(side.bottomTexture));
    const hasMid = Boolean(resolveTexName(side.midTexture));
    if ((hasTop && hasBottom) || hasMid) {
      const alignedTex = resolveSolidTexName(
        [side.topTexture, side.bottomTexture, side.midTexture],
        texturesByName,
      );
      if (alignedTex) {
        bands.push({
          part: 'mid',
          texName: alignedTex,
          bottom: ffh,
          top: fch,
          drawFromTop: !lineDef.flags.upperUnpegged,
          repeatVertical: true,
          transparent: false,
          twoSidedMiddle: Boolean(hasMid),
          sectorIndex,
          sector,
        });
      }
    }
  }

  return bands;
}

export function hwWallBandsToWallObjects(
  bands: HwWallBand[],
  map: WadMap,
  lineDef: LineDef,
  sideDefIndex: number,
  texturesByName: Record<string, WallTexture>,
  inverse: boolean,
  createWallFn: typeof import('@/wad/renderer/geometry/wallGeometry').createWall
): import('@/wad/interfaces/WallObject').WallObject[] {
  const v1 = map.VERTEXES[lineDef.v1];
  const v2 = map.VERTEXES[lineDef.v2];
  const side = map.SIDEDEFS[sideDefIndex];

  return bands.map((band) => ({
    sector: band.sector,
    sectorIndex: band.sectorIndex,
    texName: band.texName,
    transparent: band.transparent,
    twoSidedMiddle: band.twoSidedMiddle,
    repeatVertical: band.repeatVertical,
    ...createWallFn({
      v1,
      v2,
      bottom: band.bottom,
      top: band.top,
      inverse,
      side,
      texSize: texturesByName[band.texName],
      drawFromTop: band.drawFromTop,
      bottomStart: band.bottomStart,
      repeatVertical: band.repeatVertical,
    }),
  }));
}
