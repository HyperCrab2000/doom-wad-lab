/**
 * Isolated GPU path-trace shader vs CPU reference at E1M1 spawn.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { mat4 } from 'gl-matrix';

import { buildBspRenderIndex } from '../src/wad/renderer/bsp/bspRenderIndex.ts';
import { buildGzdoomDrawState } from '../src/wad/renderer/bsp/gzdoomDrawState.ts';
import { getViewAnglesFromViewMatrix, writePlayerViewMatrix } from '../src/wad/renderer/controls/playerView.ts';
import { buildMapGeometryCpu } from '../src/wad/renderer/geometry/buildMapGeometryCpu.ts';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '../src/wad/renderer/geometry/geometryCache.ts';
import { mapToSubsectorFlats } from '../src/wad/renderer/geometry/mapToSubsectorFlats.ts';
import { createPlayfieldCamera, updatePlayfieldCamera } from '../src/wad/renderer/renderGame/playfieldCamera.ts';
import { loadWadFromArrayBuffer } from '../src/wad/parser/loadWadFromArrayBuffer.ts';
import { buildSceneTriangles } from '../src/wad/renderer/rtgl/buildSceneTriangles.ts';
import { renderPathTraceCpu } from '../src/wad/renderer/rtgl/pathTraceCpu.ts';
import { packSceneTriangles } from '../src/wad/renderer/rtgl/packSceneTriangles.ts';

const CHROME =
  process.env.PUPPETEER_EXECUTABLE_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function loadSpawnScene() {
  const buf = fs.readFileSync('public/wads/DOOM.WAD');
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const map = wad.maps.E1M1;
  const player = map.THINGS.find((t) => t.type === 1);
  if (!player) throw new Error('no player');
  const sector = map.SECTORS[player.sectorIndex ?? 0];
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }
  const texLookup = Object.fromEntries(
    [...texNames].map((n) => [n, { name: n, width: 64, height: 128, transparent: false, graphics: {} }])
  );
  const geometry = buildMapGeometryCpu(map, texLookup);
  const bsp = buildBspRenderIndex(map);
  const subsectorFlatObjects = mapToSubsectorFlats(map, bsp);
  const buffers = {
    bspRenderIndex: bsp,
    walls: pathTraceWallSlicesFromWallObjects(geometry.walls),
    flats: pathTraceFlatSlicesFromFlatObjects(geometry.flats),
    subsectorFlats: pathTraceFlatSlicesFromFlatObjects(subsectorFlatObjects),
    wallRangesByLine: buildWallRangesByLine(geometry.walls, map.LINEDEFS.length),
    wallRangesByLineAndSide: buildWallRangesByLineAndSide(
      geometry.walls.map((w) => ({ lineIndex: w.lineIndex ?? -1, sideDefIndex: w.sideDefIndex ?? -1 })),
      map.LINEDEFS.length,
      map
    ),
  };
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
  const tris = buildSceneTriangles(map, buffers, drawState);
  const packed = packSceneTriangles(tris, new Map(), new Map(), new Map());
  return { tris, packed, invViewProj: Array.from(playfield.invViewProjMatrix) };
}

async function main() {
  const frag = fs.readFileSync('src/wad/renderer/rtgl/shaders/pathTrace.frag', 'utf8');
  const vert = fs.readFileSync('src/wad/renderer/rtgl/shaders/pathTrace.vert', 'utf8');
  const { tris, packed, invViewProj } = loadSpawnScene();
  const w = 320;
  const h = 168;
  const cpuPx = renderPathTraceCpu(
    tris,
    new Float32Array(invViewProj),
    { wallColors: new Map(), floorColors: new Map() },
    new Array(256).fill(0.75),
    w,
    h
  );
  let cpuNonSky = 0;
  for (let i = 0; i < cpuPx.length; i += 4) {
    if (!(cpuPx[i] === 115 && cpuPx[i + 1] === 158 && cpuPx[i + 2] === 224)) cpuNonSky++;
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    channel: fs.existsSync(CHROME) ? undefined : 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const browserFn = fs.readFileSync('scripts/gpu-shader-isolated-browser.js', 'utf8');
  const gpu = await page.evaluate(
    (fnSource, vertSrc, fragSrc, dataBytes, colorBytes, bounds, invM, triCount, texW, texH, colorW, colorH, rw, rh) => {
      const fn = new Function(fnSource + '; return runGpuPathTrace;')();
      return fn(vertSrc, fragSrc, dataBytes, colorBytes, bounds, invM, triCount, texW, texH, colorW, colorH, rw, rh);
    },
    browserFn,
    vert,
    frag,
    Array.from(packed.dataBytes),
    Array.from(packed.colorData),
    packed.bounds,
    invViewProj,
    packed.count,
    packed.width,
    packed.height,
    packed.colorWidth,
    packed.colorHeight,
    w,
    h
  );
  await browser.close();

  const report = {
    triCount: tris.length,
    cpuNonSkyRatio: (cpuNonSky / (w * h)).toFixed(3),
    gpuNonSkyRatio: (gpu.nonSky / gpu.total).toFixed(3),
    gpuCenter: gpu.center,
    cpuCenter: [cpuPx[((Math.floor(h / 2) * w + Math.floor(w / 2)) * 4)], cpuPx[((Math.floor(h / 2) * w + Math.floor(w / 2)) * 4) + 1], cpuPx[((Math.floor(h / 2) * w + Math.floor(w / 2)) * 4) + 2]],
  };
  console.log(JSON.stringify(report, null, 2));
  const ratioDiff = Math.abs(cpuNonSky / (w * h) - gpu.nonSky / gpu.total);
  if (ratioDiff > 0.15) {
    console.error('FAIL: GPU/CPU non-sky ratio differs by', ratioDiff.toFixed(3));
    process.exit(1);
  }
  console.log('PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
