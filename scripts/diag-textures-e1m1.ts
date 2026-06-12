import fs from 'node:fs';
import { loadWadFromArrayBuffer } from '../src/wad/parser/loadWadFromArrayBuffer.ts';
import { drawWadAssetsForMap } from '../src/wad/renderer/drawAssets/drawWadAssets.ts';
import { buildMapGeometryCpu } from '../src/wad/renderer/geometry/buildMapGeometryCpu.ts';
import { buildBspRenderIndex } from '../src/wad/renderer/bsp/bspRenderIndex.ts';
import { buildBspVisibleSet } from '../src/wad/renderer/bsp/bspVisibility.ts';
import { buildWallRangesByLine } from '../src/wad/renderer/geometry/geometryCache.ts';

async function main() {
const buf = fs.readFileSync('public/wads/DOOM.WAD');
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = wad.maps.E1M1;
const assets = await drawWadAssetsForMap(wad, map, 'E1M1');
const tex = assets.texturesByName;
const geo = buildMapGeometryCpu(map, tex);
const index = buildBspRenderIndex(map)!;
const ps = map.THINGS.find((t) => t.type === 1)!;
const bsp = buildBspVisibleSet({
  map,
  index,
  viewX: ps.x,
  viewY: ps.y,
  viewYaw: (ps.angle * Math.PI) / 180,
});
const ranges = buildWallRangesByLine(geo.walls, map.LINEDEFS.length);

let bands = 0;
let noBand = 0;
let texMissingAtDraw = 0;
for (const entry of bsp.wallDrawOrder) {
  const range = ranges[entry.lineIndex];
  if (!range || range.count <= 0) {
    noBand++;
    continue;
  }
  let found = false;
  for (let wi = range.start; wi < range.start + range.count; wi++) {
    const wall = geo.walls[wi];
    if (wall.sideDefIndex !== entry.sideDefIndex) continue;
    found = true;
    bands++;
    if (!tex[wall.texName!]) texMissingAtDraw++;
  }
  if (!found) noBand++;
}

const flatNames = new Set(assets.flats.map((f) => f.name));
let visibleFlatDraws = 0;
let missingFlatDraws = 0;
for (const si of bsp.flatSectorOrder) {
  for (const flat of geo.flats) {
    if (flat.sectorIndex !== si) continue;
    visibleFlatDraws++;
    if (!flatNames.has(flat.flatName)) missingFlatDraws++;
  }
}

console.log('walls baked', geo.walls.length);
console.log('BSP wall entries', bsp.wallDrawOrder.length);
console.log('matching bands', bands, 'entries with no band', noBand);
console.log('wall tex missing at draw', texMissingAtDraw);
console.log('flat draws', visibleFlatDraws, 'missing flat lump', missingFlatDraws);
}

main();
