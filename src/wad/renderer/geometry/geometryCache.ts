import type { FlatBuffer } from '@/wad/interfaces/FlatBuffer';
import type { WallBuffer } from '@/wad/interfaces/WallBuffer';
import type { WallObject } from '@/wad/interfaces/WallObject';
import { normalizeFlatName } from '@/wad/renderer/renderGame/sectorLighting';

export function buildSortedFlats(flats: FlatBuffer[]): FlatBuffer[] {
  return flats.slice().sort((a, b) => {
    const aIsFloor = normalizeFlatName(a.flatName) === normalizeFlatName(a.sector.floorpic);
    const bIsFloor = normalizeFlatName(b.flatName) === normalizeFlatName(b.sector.floorpic);
    if (aIsFloor && bIsFloor) {
      return a.sector.floorheight - b.sector.floorheight;
    }
    if (aIsFloor !== bIsFloor) {
      return aIsFloor ? -1 : 1;
    }
    return b.sector.ceilingheight - a.sector.ceilingheight;
  });
}

export interface WallRangeSlice {
  start: number;
  count: number;
}

export interface WallRangesByLineAndSide {
  side0: WallRangeSlice;
  side1: WallRangeSlice;
}

export function buildWallRangesByLineAndSide(
  walls: ReadonlyArray<{ lineIndex: number; sideDefIndex: number }>,
  lineCount: number,
  map: { LINEDEFS: Array<{ sidenum: [number, number] }> }
): WallRangesByLineAndSide[] {
  const emptySlice = (): WallRangeSlice => ({ start: -1, count: 0 });
  const ranges = Array.from({ length: lineCount }, () => ({
    side0: emptySlice(),
    side1: emptySlice(),
  }));

  walls.forEach((wall, wallIndex) => {
    const lineIndex = wall.lineIndex;
    if (lineIndex < 0) return;
    const line = map.LINEDEFS[lineIndex];
    const useSide1 = line && line.sidenum[1] >= 0 && wall.sideDefIndex === line.sidenum[1];
    const slice = useSide1 ? ranges[lineIndex]!.side1 : ranges[lineIndex]!.side0;
    if (slice.start < 0) {
      slice.start = wallIndex;
    }
    slice.count++;
  });

  return ranges;
}

export function buildWallRangesByLine(
  walls: WallObject[],
  lineCount: number
): Array<{ start: number; count: number }> {
  return buildWallRangesFromWallBuffers(
    walls.map((wall) => ({ lineIndex: wall.lineIndex ?? -1 })),
    lineCount
  );
}

export function buildWallRangesFromWallBuffers(
  walls: ReadonlyArray<{ lineIndex: number }>,
  lineCount: number
): Array<{ start: number; count: number }> {
  const ranges = Array.from({ length: lineCount }, () => ({ start: -1, count: 0 }));
  walls.forEach((wall, wallIndex) => {
    const lineIndex = wall.lineIndex;
    if (lineIndex < 0) return;
    const range = ranges[lineIndex];
    if (range.start < 0) {
      range.start = wallIndex;
    }
    range.count++;
  });
  return ranges;
}

/** Sort opaque walls to minimize texture and sector uniform changes each frame. */
export function sortOpaqueWallsForDraw(walls: WallBuffer[]): WallBuffer[] {
  return walls
    .slice()
    .sort(
      (a, b) =>
        a.texName.localeCompare(b.texName) ||
        a.sectorIndex - b.sectorIndex ||
        a.lineIndex - b.lineIndex
    );
}

export function rebuildWallDrawLists(walls: WallBuffer[]): {
  opaqueWalls: WallBuffer[];
  transparentWalls: WallBuffer[];
} {
  const opaqueWalls: WallBuffer[] = [];
  const transparentWalls: WallBuffer[] = [];
  for (const wall of walls) {
    if (wall.transparent) {
      transparentWalls.push(wall);
    } else {
      opaqueWalls.push(wall);
    }
  }
  return {
    opaqueWalls: sortOpaqueWallsForDraw(opaqueWalls),
    transparentWalls,
  };
}
