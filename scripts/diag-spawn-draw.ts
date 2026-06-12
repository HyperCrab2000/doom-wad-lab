/**
 * E1M1 spawn: BSP draw list vs baked wall bands vs texture names.
 */
import fs from 'node:fs';
import { loadWadFromArrayBuffer } from '../src/wad/parser/loadWadFromArrayBuffer.ts';
import { buildBspRenderIndex } from '../src/wad/renderer/bsp/bspRenderIndex.ts';
import { buildGzdoomDrawState } from '../src/wad/renderer/bsp/gzdoomDrawState.ts';
import { buildWallRangesByLine } from '../src/wad/renderer/geometry/geometryCache.ts';
import { buildMapGeometryCpu } from '../src/wad/renderer/geometry/buildMapGeometryCpu.ts';
import { collectMapWallAndFlatNames } from '../src/wad/renderer/drawAssets/collectMapAssets.ts';
import { doomAngleToYaw } from '../src/wad/renderer/controls/playerView.ts';

const buf = fs.readFileSync('public/wads/DOOM.WAD');
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const map = wad.maps.E1M1;
const index = buildBspRenderIndex(map)!;
const start = map.THINGS.find((t) => t.type === 1)!;
const viewYaw = doomAngleToYaw(start.angle);

const { wallNames } = collectMapWallAndFlatNames(map);
const texturesByName: Record<string, { name: string; width: number; height: number; transparent: boolean }> = {};
for (const n of wallNames) {
  texturesByName[n] = { name: n, width: 64, height: 128, transparent: n === 'LITE3' };
}

const geo = buildMapGeometryCpu(map, texturesByName as never);
const ranges = buildWallRangesByLine(geo.walls, map.LINEDEFS.length);

const state = buildGzdoomDrawState({
  map,
  buffers: { bspRenderIndex: index } as never,
  viewX: start.x,
  viewY: start.y,
  viewYaw,
  cameraPos: [start.x, 0, -start.y],
});

let noBand = 0;
let noTexName = 0;
const samples: string[] = [];

for (const entry of state!.wallDrawOrder) {
  const range = ranges[entry.lineIndex];
  if (!range || range.count <= 0) {
    noBand++;
    if (samples.length < 15) samples.push(`line ${entry.lineIndex}: NO BANDS`);
    continue;
  }
  for (let wi = range.start; wi < range.start + range.count; wi++) {
    const wall = geo.walls[wi];
    if (!wall?.texName) {
      noTexName++;
    }
  }
}

console.log('=== E1M1 spawn draw audit ===');
console.log('BSP+supplement wall entries', state!.wallDrawOrder.length);
console.log('entries with zero baked bands', noBand);
console.log('walls missing texName', noTexName);
console.log('total baked walls', geo.walls.length);
console.log('samples:', samples.join('\n  '));

const near = [1, 2, 3, 4, 5, 7, 13, 16, 46, 470, 471, 474, 476];
console.log('\n=== nearby lines ===');
for (const li of near) {
  const r = ranges[li];
  const inDraw = state!.wallDrawOrder.some((e) => e.lineIndex === li);
  const bandCount = r?.count ?? 0;
  const texs = [];
  if (r && r.count > 0) {
    for (let wi = r.start; wi < r.start + r.count; wi++) {
      texs.push(geo.walls[wi]?.texName);
    }
  }
  console.log(`line ${li}: draw=${inDraw} bands=${bandCount} tex=${texs.join(',') || '-'}`);
}
