import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const { loadWadFromArrayBuffer } = await import('../src/wad/parser/loadWadFromArrayBuffer.ts');
const { buildBspRenderIndex } = await import('../src/wad/renderer/bsp/bspRenderIndex.ts');
const { buildGzdoomDrawState } = await import('../src/wad/renderer/bsp/gzdoomDrawState.ts');
const { buildSectorVisibilityIndex } = await import('../src/wad/renderer/utils/sectorVisibility.ts');
const { mapToSubsectorFlats } = await import('../src/wad/renderer/geometry/mapToSubsectorFlats.ts');

const wadPath = path.join(root, 'public/wads/DOOM.WAD');
const buf = fs.readFileSync(wadPath);
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

function snapshot(x, y, yaw) {
  const state = buildGzdoomDrawState({
    map,
    buffers,
    viewX: x,
    viewY: y,
    viewYaw: yaw,
    cameraPos: [x, 41, -y],
  });
  const flatSectors = new Set();
  for (const sub of state.flatSubsectorOrder) {
    flatSectors.add(index.subsectorToSector[sub] ?? -1);
  }
  const wallSectors = new Set();
  for (const e of state.wallDrawOrder) {
    wallSectors.add(map.SIDEDEFS[e.sideDefIndex]?.sector ?? -1);
  }
  return {
    cam: state.cameraSectorIndex,
    sub: state.cameraSubsector,
    flats: state.flatSubsectorOrder.length,
    walls: state.wallDrawOrder.length,
    flatSectors: [...flatSectors].sort((a, b) => a - b).join(','),
    has44: flatSectors.has(44),
    wall44: wallSectors.has(44),
    bspFlats: state.bspFlatSubsectorOrder.length,
    bspWalls: state.bspWallDrawOrder.length,
  };
}

function hash(s) {
  return `${s.cam}|${s.sub}|${s.flats}|${s.walls}|${s.flatSectors}|${s.has44}|${s.wall44}`;
}

const b44 = sv.sectorBounds[44];
const b3 = sv.sectorBounds[3];
console.log('Sector 44 bounds', b44);
console.log('Sector 3 bounds', b3);

const yaw = 0;
const probes = [];
for (let dx = -64; dx <= 64; dx += 8) {
  for (let dy = -64; dy <= 64; dy += 8) {
    const x = (b44.minX + b44.maxX) / 2 + dx;
    const y = (b44.minY + b44.maxY) / 2 + dy;
    probes.push({ x, y, s: snapshot(x, y, yaw) });
  }
}

const unique = new Set(probes.map((p) => hash(p.s)));
console.log(`Sector 44 grid: ${probes.length} probes, ${unique.size} unique draw snapshots`);

const flickerPairs = [];
for (let i = 0; i < probes.length; i++) {
  for (let j = i + 1; j < probes.length; j++) {
    const a = probes[i];
    const b = probes[j];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (dist > 12) continue;
    if (hash(a.s) !== hash(b.s)) {
      flickerPairs.push({ dist, a, b });
    }
  }
}
console.log(`Adjacent (<12 units) with different draw state: ${flickerPairs.length}`);
for (const pair of flickerPairs.slice(0, 10)) {
  console.log('---');
  console.log(`dist=${pair.dist.toFixed(1)}`, pair.a.x.toFixed(0), pair.a.y.toFixed(0), pair.a.s);
  console.log(`dist=${pair.dist.toFixed(1)}`, pair.b.x.toFixed(0), pair.b.y.toFixed(0), pair.b.s);
}

// Sector 3 courtyard probe
const cx = (b3.minX + b3.maxX) / 2;
const cy = (b3.minY + b3.maxY) / 2;
const b42 = sv.sectorBounds[42];
const cyaw = Math.atan2((b42.minY + b42.maxY) / 2 - cy, (b42.minX + b42.maxX) / 2 - cx);
const state3 = buildGzdoomDrawState({
  map,
  buffers,
  viewX: cx,
  viewY: cy,
  viewYaw: cyaw,
  cameraPos: [cx, 41, -cy],
});
console.log('\nSector 3 facing courtyard:', snapshot(cx, cy, cyaw));
const wallLines = [];
for (const e of state3.wallDrawOrder) {
  const sec = map.SIDEDEFS[e.sideDefIndex]?.sector ?? -1;
  if (sec === 41 || sec === 42 || sec === 43) wallLines.push({ line: e.lineIndex, sec });
}
console.log('Courtyard wall entries:', wallLines.length);
console.log('BSP wall entries (no supplement):', state3.bspWallDrawOrder.length, 'supplemented:', state3.wallDrawOrder.length);

// Compare supplement delta at stair
const base = snapshot((b44.minX + b44.maxX) / 2, (b44.minY + b44.maxY) / 2, Math.PI / 2);
console.log('\nSector 44 center facing east:', base);
