import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { loadWadFromArrayBuffer } = await import('../src/wad/parser/loadWadFromArrayBuffer.ts');
const { buildBspRenderIndex } = await import('../src/wad/renderer/bsp/bspRenderIndex.ts');
const { buildGzdoomDrawState } = await import('../src/wad/renderer/bsp/gzdoomDrawState.ts');
const { buildSectorVisibilityIndex } = await import('../src/wad/renderer/utils/sectorVisibility.ts');
const { mapToSubsectorFlats } = await import('../src/wad/renderer/geometry/mapToSubsectorFlats.ts');
const { buildMapGeometryCpu } = await import('../src/wad/renderer/geometry/buildMapGeometryCpu.ts');
const { buildWallRangesByLineAndSide } = await import('../src/wad/renderer/geometry/geometryCache.ts');
const { wallSliceForEntry } = await import('../src/wad/renderer/gzdoom/gzdoomRenderer.ts');

const buf = fs.readFileSync(path.join(root, 'public/wads/DOOM.WAD'));
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = wad.maps.E1M1;
const index = buildBspRenderIndex(map);
const sv = buildSectorVisibilityIndex(map);
const subsectorFlats = mapToSubsectorFlats(map, index);
const tex = {};
for (const s of map.SIDEDEFS) {
  for (const t of [s.topTexture, s.midTexture, s.bottomTexture]) {
    if (t && t !== '-') {
      const transparent = t.includes('LITE') || t.includes('GRATE');
      tex[t] = { name: t, width: 64, height: 128, transparent, graphics: {} };
    }
  }
}
const geo = buildMapGeometryCpu(map, tex);
const wallRanges = buildWallRangesByLineAndSide(
  geo.walls.map((w) => ({ lineIndex: w.lineIndex ?? -1, sideDefIndex: w.sideDefIndex ?? -1 })),
  map.LINEDEFS.length,
  map
);
const buffers = {
  bspRenderIndex: index,
  sectorVisibility: sv,
  sectorTriangles: {},
  triangleHash: null,
  wallRangesByLine: [],
  flats: [],
  subsectorFlats,
  walls: geo.walls,
  wallRangesByLineAndSide: wallRanges,
};

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

console.log('Sector 3 -> courtyard:', {
  cam: state.cameraSectorIndex,
  flat42: state.flatSubsectorOrder.some((ss) => index.subsectorToSector[ss] === 42),
  walls: state.wallDrawOrder.length,
});

const courtyardEntries = [];
for (const entry of state.wallDrawOrder) {
  const sec = map.SIDEDEFS[entry.sideDefIndex]?.sector ?? -1;
  if (sec !== 41 && sec !== 42 && sec !== 43) continue;
  const slice = wallSliceForEntry(buffers, map, entry.lineIndex, entry.sideDefIndex);
  const side = map.SIDEDEFS[entry.sideDefIndex];
  courtyardEntries.push({
    line: entry.lineIndex,
    sec,
    mid: side?.midTexture,
    slice: slice ? `${slice.start}+${slice.count}` : 'MISSING',
  });
}
console.log('Courtyard wall entries with geometry:', courtyardEntries.filter((e) => e.slice !== 'MISSING').length);
console.log('Missing geometry:', courtyardEntries.filter((e) => e.slice === 'MISSING'));
console.log('LITE entries:', courtyardEntries.filter((e) => e.mid?.includes('LITE')));

// flat subsectors for 42
const ss42 = state.flatSubsectorOrder.filter((ss) => index.subsectorToSector[ss] === 42);
console.log('Flat subsectors for 42:', ss42.length, 'subsector flats available:', ss42.map((ss) => subsectorFlats.filter((f) => f.subsectorIndex === ss).length));
