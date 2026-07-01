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

const buf = fs.readFileSync(path.join(root, 'public/wads/DOOM.WAD'));
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = wad.maps.E1M1;
const index = buildBspRenderIndex(map);
const sv = buildSectorVisibilityIndex(map);
const subsectorFlats = mapToSubsectorFlats(map, index);
const tex = {};
for (const s of map.SIDEDEFS) {
  for (const t of [s.topTexture, s.midTexture, s.bottomTexture]) {
    if (t && t !== '-') tex[t] = { name: t, width: 64, height: 128, transparent: false, graphics: {} };
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

function analyzeSector44Walls(x, y, yaw) {
  const state = buildGzdoomDrawState({
    map,
    buffers,
    viewX: x,
    viewY: y,
    viewYaw: yaw,
    cameraPos: [x, 41, -y],
  });
  const drawnLines = new Set(state.wallDrawOrder.map((e) => e.lineIndex));
  const bspLines = new Set(state.bspWallDrawOrder.map((e) => e.lineIndex));

  const sec44Lines = [];
  for (let li = 0; li < map.LINEDEFS.length; li++) {
    const line = map.LINEDEFS[li];
    let touch44 = false;
    for (const si of line.sidenum) {
      if (si >= 0 && map.SIDEDEFS[si]?.sector === 44) touch44 = true;
    }
    if (!touch44) continue;
    const range = wallRanges[li];
    const hasGeo =
      range && ((range.side0?.count ?? 0) > 0 || (range.side1?.count ?? 0) > 0);
    sec44Lines.push({
      li,
      drawn: drawnLines.has(li),
      bsp: bspLines.has(li),
      hasGeo,
      oneSided: line.sidenum[1] < 0,
    });
  }

  const ss44 = [];
  for (let ss = 0; ss < index.subsectorToSector.length; ss++) {
    if (index.subsectorToSector[ss] === 44) ss44.push(ss);
  }

  return {
    cam: state.cameraSectorIndex,
    sub: state.cameraSubsector,
    sec44Lines,
    ss44,
    flatSs44: ss44.filter((ss) => state.flatSubsectorOrder.includes(ss)),
    walls: state.wallDrawOrder.length,
    bspWalls: state.bspWallDrawOrder.length,
  };
}

const x = -224;
const y = -3232;
const yaw = Math.PI / 2;
const r = analyzeSector44Walls(x, y, yaw);
console.log('cam sector', r.cam, 'sub', r.sub);
console.log('sector 44 lines total', r.sec44Lines.length, 'with geo', r.sec44Lines.filter((l) => l.hasGeo).length);
console.log('drawn', r.sec44Lines.filter((l) => l.drawn).length, 'bsp', r.sec44Lines.filter((l) => l.bsp).length);
console.log('missing geo not drawn:', r.sec44Lines.filter((l) => l.hasGeo && !l.drawn));
console.log('sector44 subsectors', r.ss44, 'in flat order', r.flatSs44);

// find toggling wall between y positions
function wallSet(yPos) {
  const st = buildGzdoomDrawState({
    map,
    buffers,
    viewX: -280,
    viewY: yPos,
    viewYaw: 0,
    cameraPos: [-280, 41, -yPos],
  });
  return new Set(st.wallDrawOrder.map((e) => e.lineIndex));
}
const a = wallSet(-3264);
const b = wallSet(-3256);
const onlyA = [...a].filter((l) => !b.has(l));
const onlyB = [...b].filter((l) => !a.has(l));
console.log('\nToggling walls between y=-3264 and y=-3256:');
console.log('only at -3264', onlyA);
console.log('only at -3256', onlyB);
for (const li of [...onlyA, ...onlyB]) {
  const line = map.LINEDEFS[li];
  const sides = line.sidenum.map((si) => (si >= 0 ? map.SIDEDEFS[si]?.sector : -1));
  console.log(' line', li, 'sectors', sides);
}

console.log('\nLine 454 along Y:');
function snap(y) {
  const st = buildGzdoomDrawState({
    map,
    buffers,
    viewX: -280,
    viewY: y,
    viewYaw: 0,
    cameraPos: [-280, 41, -y],
  });
  const has454 = st.wallDrawOrder.some((e) => e.lineIndex === 454);
  const bsp454 = st.bspWallDrawOrder.some((e) => e.lineIndex === 454);
  return { y, cam: st.cameraSectorIndex, sub: st.cameraSubsector, has454, bsp454, walls: st.wallDrawOrder.length };
}
for (let y = -3280; y <= -3240; y += 4) {
  console.log(snap(y));
}
