import fs from 'node:fs';
import { loadWadFromArrayBuffer } from '../src/wad/parser/loadWadFromArrayBuffer.ts';
import { buildBspRenderIndex } from '../src/wad/renderer/bsp/bspRenderIndex.ts';
import { buildBspVisibleSet } from '../src/wad/renderer/bsp/bspVisibility.ts';
import { hwCheckClip } from '../src/wad/renderer/bsp/hwCheckClip.ts';
import { shouldRenderFullscreenSkybox } from '../src/wad/renderer/utils/sectorSkyVisibility.ts';

const buf = fs.readFileSync('public/wads/DOOM.WAD');
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = wad.maps.E1M1;
const index = buildBspRenderIndex(map)!;
const ps = map.THINGS.find((t) => t.type === 1)!;
const bsp = buildBspVisibleSet({
  map,
  index,
  viewX: ps.x,
  viewY: ps.y,
  viewYaw: (ps.angle * Math.PI) / 180,
});

console.log('=== E1M1 spawn visibility audit ===');
console.log('camera sector', bsp.cameraSectorIndex, '(indoor:', !map.SECTORS[bsp.cameraSectorIndex]?.ceilingpic.includes('SKY'), ')');
console.log('flat sectors drawn', bsp.flatSectorOrder.length, bsp.flatSectorOrder.join(','));
console.log('wall draws', bsp.wallDrawOrder.length);
console.log('skybox?', shouldRenderFullscreenSkybox(map, bsp.cameraSectorIndex, bsp.visibleSectors));

const leaks = [41, 42, 43, 44, 45, 70];
for (const s of leaks) {
  console.log(`sector ${s} visible?`, bsp.visibleSectors.has(s));
}

let noClipOuter = 0;
for (let li = 0; li < map.LINEDEFS.length; li++) {
  const line = map.LINEDEFS[li];
  if (line.sidenum[1] < 0) continue;
  const front = map.SIDEDEFS[line.sidenum[0]].sector;
  const back = map.SIDEDEFS[line.sidenum[1]].sector;
  if (front !== 0 && back !== 0) continue;
  const other = front === 0 ? back : front;
  const side = front === 0 ? line.sidenum[0] : line.sidenum[1];
  const clip = hwCheckClip(map, li, side, front, back);
  if (!clip && map.SECTORS[front].ceilingpic.includes('SKY') && map.SECTORS[back].ceilingpic.includes('SKY')) {
    if (map.SECTORS[front].floorheight !== map.SECTORS[back].floorheight) {
      noClipOuter++;
    }
  }
}
console.log('sector0 sky boundary lines with floor step but no clip:', noClipOuter);
