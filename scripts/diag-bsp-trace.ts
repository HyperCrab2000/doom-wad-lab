import fs from 'node:fs';
import { loadWadFromArrayBuffer } from '../src/wad/parser/loadWadFromArrayBuffer.ts';
import { buildBspRenderIndex } from '../src/wad/renderer/bsp/bspRenderIndex.ts';
import { traceClassicBsp } from '../src/wad/renderer/bsp/classicBspTrace.ts';

const buf = fs.readFileSync('public/wads/DOOM.WAD');
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = wad.maps.E1M1;
const index = buildBspRenderIndex(map)!;
const ps = map.THINGS.find((t) => t.type === 1)!;

const trace = traceClassicBsp({
  map,
  index,
  viewX: ps.x,
  viewY: ps.y,
  viewYaw: (ps.angle * Math.PI) / 180,
});

console.log('=== E1M1 classic BSP trace at spawn ===');
console.log('camera sector', trace.cameraSectorIndex, 'subsector', trace.cameraSubsector);
console.log('stats', trace.stats);
console.log('wall draw entries', trace.wallDrawOrder.length);
console.log('visible linedefs', trace.visibleLineIndices.size, '/', map.LINEDEFS.length);
