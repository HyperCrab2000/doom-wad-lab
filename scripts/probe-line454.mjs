import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { loadWadFromArrayBuffer } = await import('../src/wad/parser/loadWadFromArrayBuffer.ts');
const { buildBspRenderIndex } = await import('../src/wad/renderer/bsp/bspRenderIndex.ts');

const buf = fs.readFileSync(path.join(root, 'public/wads/DOOM.WAD'));
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = wad.maps.E1M1;
const index = buildBspRenderIndex(map);

const li = 454;
console.log('Line 454:', map.LINEDEFS[li]);
for (let ss = 0; ss < index.subsectorSegs.length; ss++) {
  for (const seg of index.subsectorSegs[ss] ?? []) {
    if ((index.segLineIndex[seg] ?? -1) === li) {
      console.log('in subsector', ss, 'sector', index.subsectorToSector[ss]);
    }
  }
}
console.log('Subsector 108 sector', index.subsectorToSector[108]);
console.log('Subsector 117 sector', index.subsectorToSector[117]);
console.log('Subsector 166 sector', index.subsectorToSector[166]);

const { buildGzdoomDrawState } = await import('../src/wad/renderer/bsp/gzdoomDrawState.ts');
const { buildSectorVisibilityIndex } = await import('../src/wad/renderer/utils/sectorVisibility.ts');
const { mapToSubsectorFlats } = await import('../src/wad/renderer/geometry/mapToSubsectorFlats.ts');
const sv = buildSectorVisibilityIndex(map);
const subsectorFlats = mapToSubsectorFlats(map, index);
const buffers = { bspRenderIndex: index, sectorVisibility: sv, sectorTriangles: {}, triangleHash: null, wallRangesByLine: [], flats: [], subsectorFlats };

for (const y of [-3264, -3256]) {
  const seg = map.SEGS[490];
  const v1 = map.VERTEXES[seg.v1];
  const v2 = map.VERTEXES[seg.v2];
  const v1x = v1.x - -280;
  const v1y = v1.y - y;
  const v2x = v2.x - -280;
  const v2y = v2.y - y;
  const cross = v1x * v2y - v1y * v2x;
  console.log(`y=${y} cross=${cross.toFixed(2)}`);
}

const { buildBspVisibleSet } = await import('../src/wad/renderer/bsp/bspVisibility.ts');
const { traceClassicBsp } = await import('../src/wad/renderer/bsp/classicBspTrace.ts');
const { supplementWallDrawFromTrace, supplementTwoSidedAsymmetricWalls, supplementWallsFromFlatSubsectors } = await import('../src/wad/renderer/bsp/supplementWallDraw.ts');

for (const y of [-3264, -3256]) {
  const bsp = buildBspVisibleSet({ map, index, viewX: -280, viewY: y, viewYaw: 0 });
  const trace = traceClassicBsp({ map, index, viewX: -280, viewY: y, viewYaw: 0 });
  const afterTrace = supplementWallDrawFromTrace(map, index, -280, y, 0, bsp.wallDrawOrder, bsp.visibleSubsectors);
  const afterAsym = supplementTwoSidedAsymmetricWalls(map, afterTrace, bsp.visibleSubsectors, index);
  const afterFlat = supplementWallsFromFlatSubsectors(map, index, afterAsym, bsp.flatSubsectorOrder);
  const has = (arr) => arr.some((e) => e.lineIndex === 454);
  console.log(`y=${y}: raw=${has(bsp.wallDrawOrder)} trace=${has(afterTrace)} asym=${has(afterAsym)} flat=${has(afterFlat)}`);
  for (const [k, e] of trace.segByIndex) {
    if (e.lineIndex === 454) console.log(' trace entry', e);
  }
}
