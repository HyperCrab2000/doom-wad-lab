import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { loadWadFromArrayBuffer } = await import('../src/wad/parser/loadWadFromArrayBuffer.ts');
const { buildBspRenderIndex } = await import('../src/wad/renderer/bsp/bspRenderIndex.ts');
const { buildGzdoomDrawState } = await import('../src/wad/renderer/bsp/gzdoomDrawState.ts');
const { buildSectorVisibilityIndex } = await import('../src/wad/renderer/utils/sectorVisibility.ts');
const { mapToSubsectorFlats } = await import('../src/wad/renderer/geometry/mapToSubsectorFlats.ts');

const buf = fs.readFileSync(path.join(root, 'public/wads/DOOM.WAD'));
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = wad.maps.E1M1;
const index = buildBspRenderIndex(map);
const sv = buildSectorVisibilityIndex(map);
const subsectorFlats = mapToSubsectorFlats(map, index);
const buffers = {
  bspRenderIndex: index,
  sectorVisibility: sv,
  sectorTriangles: {},
  triangleHash: null,
  wallRangesByLine: [],
  flats: [],
  subsectorFlats,
};

const target = new Set([3, 41, 42, 43]);
console.log('Lines with midtexture touching courtyard sectors:');
for (let li = 0; li < map.LINEDEFS.length; li++) {
  const line = map.LINEDEFS[li];
  let touch = false;
  const sectors = [];
  for (const si of line.sidenum) {
    if (si < 0) continue;
    const sec = map.SIDEDEFS[si].sector;
    sectors.push(sec);
    if (target.has(sec)) touch = true;
  }
  if (!touch) continue;
  for (const si of line.sidenum) {
    if (si < 0) continue;
    const side = map.SIDEDEFS[si];
    if (side.midTexture && side.midTexture !== '-') {
      console.log({ li, sectors, sec: side.sector, mid: side.midTexture, top: side.topTexture, bottom: side.bottomTexture });
    }
  }
}

const b3 = sv.sectorBounds[3];
const b42 = sv.sectorBounds[42];
const x = (b3.minX + b3.maxX) / 2;
const y = (b3.minY + b3.maxY) / 2;
const yaw = Math.atan2((b42.minY + b42.maxY) / 2 - y, (b42.minX + b42.maxX) / 2 - x);
const state = buildGzdoomDrawState({
  map,
  buffers,
  viewX: x,
  viewY: y,
  viewYaw: yaw,
  cameraPos: [x, 41, -y],
});
const drawn = new Set(state.wallDrawOrder.map((e) => e.lineIndex));
console.log('\nDrawn lines with mid from sector 3 view:');
for (let li = 0; li < map.LINEDEFS.length; li++) {
  if (!drawn.has(li)) continue;
  for (const si of map.LINEDEFS[li].sidenum) {
    if (si < 0) continue;
    const side = map.SIDEDEFS[si];
    if (!target.has(side.sector)) continue;
    if (side.midTexture && side.midTexture !== '-') {
      console.log('drawn', li, side.sector, side.midTexture);
    }
  }
}
