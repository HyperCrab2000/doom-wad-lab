import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from 'canvas';
import { mat4 } from 'gl-matrix';

import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { getViewAnglesFromViewMatrix, writePlayerViewMatrix } from '@/wad/renderer/controls/playerView';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '@/wad/renderer/geometry/geometryCache';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { createPlayfieldCamera, updatePlayfieldCamera } from '@/wad/renderer/renderGame/playfieldCamera';
import { buildSceneTriangles } from '@/wad/renderer/rtgl/buildSceneTriangles';
import { renderPathTraceCpu } from '@/wad/renderer/rtgl/pathTraceCpu';

const OUT = path.resolve('tmp-e1m1-verify/cpu-pathtrace-reference.png');

function loadE1M1() {
  const wadPath = path.resolve('public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

function buildTextureLookup(map: ReturnType<typeof loadE1M1>) {
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }
  const texturesByName: Record<string, { name: string; width: number; height: number; transparent: boolean; graphics: never }> = {};
  for (const name of texNames) {
    texturesByName[name] = { name, width: 64, height: 128, transparent: false, graphics: {} as never };
  }
  return texturesByName;
}

async function main() {
  const map = loadE1M1();
  const player = map.THINGS.find((thing) => thing.type === 1)!;
  const sector = map.SECTORS[player.sectorIndex ?? 0] ?? map.SECTORS[0];
  const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
  const bspRenderIndex = buildBspRenderIndex(map);
  const subsectorFlatObjects = mapToSubsectorFlats(map, bspRenderIndex);
  const buffers = {
    bspRenderIndex,
    walls: pathTraceWallSlicesFromWallObjects(geometry.walls),
    flats: pathTraceFlatSlicesFromFlatObjects(geometry.flats),
    subsectorFlats: pathTraceFlatSlicesFromFlatObjects(subsectorFlatObjects),
    wallRangesByLine: buildWallRangesByLine(geometry.walls, map.LINEDEFS.length),
    wallRangesByLineAndSide: buildWallRangesByLineAndSide(
      geometry.walls.map((wall) => ({
        lineIndex: wall.lineIndex ?? -1,
        sideDefIndex: wall.sideDefIndex ?? -1,
      })),
      map.LINEDEFS.length,
      map
    ),
  } as never;

  const viewMatrix = mat4.create();
  writePlayerViewMatrix(viewMatrix, {
    x: player.x,
    y: player.y,
    yaw: (player.angle * Math.PI) / 180,
    pitch: 0,
    worldFeetZ: sector.floorheight,
    sector,
  });

  const playfield = createPlayfieldCamera();
  updatePlayfieldCamera(playfield, 1280, 900, 45, 0.1, 64000, viewMatrix, mat4.create());

  const { yaw } = getViewAnglesFromViewMatrix(viewMatrix);
  const invView = mat4.invert(mat4.create(), viewMatrix)!;
  const eye: [number, number, number] = [invView[12], invView[13], invView[14]];
  const drawState = buildGzdoomDrawState({
    map,
    buffers,
    viewX: player.x,
    viewY: player.y,
    viewYaw: yaw,
    cameraPos: eye,
  });
  const triangles = buildSceneTriangles(map, buffers, drawState);

  const w = playfield.layout.width;
  const h = playfield.layout.height;
  const pixels = renderPathTraceCpu(
    triangles,
    playfield.invViewProjMatrix,
    { wallColors: new Map(), floorColors: new Map() },
    new Array(256).fill(0.75),
    w,
    h
  );

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  img.data.set(pixels);
  ctx.putImageData(img, 0, 0);
  fs.writeFileSync(OUT, canvas.toBuffer('image/png'));
  console.log(JSON.stringify({ out: OUT, w, h, triangles: triangles.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
