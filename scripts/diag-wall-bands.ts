import { loadWadForMap, buildMapTextureLookup } from '../test/integration/helpers/wadFixtures';
import { buildMapGeometryCpu } from '../src/wad/renderer/geometry/buildMapGeometryCpu';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
} from '../src/wad/renderer/geometry/geometryCache';
import { buildGzdoomDrawState } from '../src/wad/renderer/bsp/gzdoomDrawState';
import { buildBspRenderIndex } from '../src/wad/renderer/bsp/bspRenderIndex';
import { doomAngleToYaw } from '../src/wad/renderer/controls/playerView';

const { wad, map } = loadWadForMap('E1M1');
const tex = buildMapTextureLookup(map, wad);
const geo = buildMapGeometryCpu(map, tex);
const index = buildBspRenderIndex(map)!;
const start = map.THINGS.find((t) => t.type === 1)!;
const wallRangesByLine = buildWallRangesByLine(geo.walls, map.LINEDEFS.length);
const wallRangesByLineAndSide = buildWallRangesByLineAndSide(
  geo.walls,
  map.LINEDEFS.length,
  map
);

const state = buildGzdoomDrawState({
  map,
  buffers: {
    bspRenderIndex: index,
    walls: geo.walls,
    wallRangesByLine,
    wallRangesByLineAndSide,
  } as never,
  viewX: start.x,
  viewY: start.y,
  viewYaw: doomAngleToYaw(start.angle),
  cameraPos: [start.x, 41, -start.y],
});

let bandsAll = 0;
let bandsSide = 0;
let missSide = 0;
let opaqueSide = 0;

for (const entry of state!.wallDrawOrder) {
  const range = wallRangesByLine[entry.lineIndex];
  if (range?.count) {
    for (let wi = range.start; wi < range.start + range.count; wi++) {
      const wall = geo.walls[wi];
      if (wall && !wall.transparent) bandsAll++;
    }
  }

  const line = map.LINEDEFS[entry.lineIndex]!;
  const useSide1 = line.sidenum[1] >= 0 && entry.sideDefIndex === line.sidenum[1];
  const slice = useSide1
    ? wallRangesByLineAndSide[entry.lineIndex]!.side1
    : wallRangesByLineAndSide[entry.lineIndex]!.side0;

  if (!slice || slice.count <= 0) {
    missSide++;
    continue;
  }

  for (let wi = slice.start; wi < slice.start + slice.count; wi++) {
    const wall = geo.walls[wi];
    if (wall && !wall.transparent) opaqueSide++;
  }
  bandsSide += slice.count;
}

console.log({
  entries: state!.wallDrawOrder.length,
  opaqueBandsAllLines: bandsAll,
  sideSliceCount: bandsSide,
  opaqueBandsMatchingSide: opaqueSide,
  entriesMissingSideSlice: missSide,
});
