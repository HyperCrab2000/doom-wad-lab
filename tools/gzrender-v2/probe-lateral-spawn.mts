#!/usr/bin/env npx tsx
/**
 * Diagnose lateral spawn probes: ray pick, wall screen spans, colormap vis, gold vs classic RGB.
 */
import fs from 'node:fs';
import path from 'node:path';
import { mat4, vec3 } from 'gl-matrix';

import { loadWadFromArrayBuffer } from '../../src/wad/parser/loadWadFromArrayBuffer.ts';
import { buildBspRenderIndex } from '../../src/wad/renderer/bsp/bspRenderIndex.ts';
import { buildGzdoomDrawState } from '../../src/wad/renderer/bsp/gzdoomDrawState.ts';
import {
  getPlayerEyeZ,
  writePlayerViewMatrix,
  type PlayerViewState,
} from '../../src/wad/renderer/controls/playerView.ts';
import { buildMapGeometryCpu } from '../../src/wad/renderer/geometry/buildMapGeometryCpu.ts';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '../../src/wad/renderer/geometry/geometryCache.ts';
import { mapToSubsectorFlats } from '../../src/wad/renderer/geometry/mapToSubsectorFlats.ts';
import { buildSceneTriangles, type SceneTriangle } from '../../src/wad/renderer/rtgl/buildSceneTriangles.ts';
import { buildInvViewProj } from '../../src/wad/renderer/rtgl/pathTraceCpu.ts';
import {
  computeGzdoomParityViewLayout,
  VANILLA_3D_HEIGHT,
  VANILLA_SCREEN_WIDTH,
} from '../../src/wad/renderer/renderGame/gameViewLayout.ts';
import { doomVerticalFovDegrees } from '../../src/wad/parity/frame/frameParity.ts';
import { FROZEN_GOLD_PARITY_PITCH } from '../../src/wad/parity/frame/frameParity.ts';
import { globVisFromPlayfield } from '../../src/wad/parity/frame/gzdoomGlobVis.ts';
import {
  gzdoomColormapIndex,
  shadePalIndex,
  wallVisibility,
} from '../../src/wad/parity/frame/gzdoomColormap.ts';
import {
  gzdoomScreenZ,
  gzdoomViewport,
  gzdoomWallScreenX,
  gzdoomWallScreenY,
  wallColumnVisibilityRange,
} from '../../src/wad/parity/frame/gzdoomScreenZ.ts';
import { colormapSectorLightLevel } from '../../src/wad/renderer/renderGame/sectorDynamicLight.ts';
import { hwWallProcessSide } from '../../src/wad/renderer/bsp/hwWallProcess.ts';
import {
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';
import { buildSectorVisibilityIndex } from '../../src/wad/renderer/utils/sectorVisibility.ts';
import type { WallTexture } from '../../src/wad/interfaces/WallTexture.ts';
import type { WadMap } from '../../src/wad/interfaces/WadMap.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png');
const CLASSIC = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare/E1M1-classic-spawn.png');
const PROBES = [
  { x: 48, y: 60, label: 'left wall' },
  { x: 160, y: 60, label: 'center void' },
  { x: 272, y: 60, label: 'right wall/sky' },
];

function loadE1M1() {
  const buf = fs.readFileSync(path.join(ROOT, 'public/wads/DOOM.WAD'));
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { wad, map: wad.maps.E1M1 };
}

function buildTextureLookup(map: WadMap, wad: ReturnType<typeof loadE1M1>['wad']) {
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }
  const texturesByName: Record<string, WallTexture> = {};
  for (const name of texNames) {
    const lump = wad.textures[name];
    texturesByName[name] = {
      name,
      width: lump?.width ?? 64,
      height: lump?.height ?? 128,
      transparent: false,
      graphics: {} as never,
    };
  }
  return texturesByName;
}

function rayTriangleHit(
  ro: [number, number, number],
  rd: [number, number, number],
  tri: SceneTriangle,
): number | null {
  const [v0, v1, v2] = [tri.v0, tri.v1, tri.v2];
  const e1x = v1[0] - v0[0];
  const e1y = v1[1] - v0[1];
  const e1z = v1[2] - v0[2];
  const e2x = v2[0] - v0[0];
  const e2y = v2[1] - v0[1];
  const e2z = v2[2] - v0[2];
  const [rdX, rdY, rdZ] = rd;
  const px = rdY * e2z - rdZ * e2y;
  const py = rdZ * e2x - rdX * e2z;
  const pz = rdX * e2y - rdY * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-6) return null;
  const invDet = 1 / det;
  const tvx = ro[0] - v0[0];
  const tvy = ro[1] - v0[1];
  const tvz = ro[2] - v0[2];
  const u = (tvx * px + tvy * py + tvz * pz) * invDet;
  if (u < 0 || u > 1) return null;
  const qx = tvy * e1z - tvz * e1y;
  const qy = tvz * e1x - tvx * e1z;
  const qz = tvx * e1y - tvy * e1x;
  const v = (rdX * qx + rdY * qy + rdZ * qz) * invDet;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  return t > 1e-4 ? t : null;
}

function unproject(
  invViewProj: mat4,
  ndcX: number,
  ndcY: number,
  ndcZ: number,
  out: [number, number, number],
): void {
  const x =
    invViewProj[0] * ndcX + invViewProj[4] * ndcY + invViewProj[8] * ndcZ + invViewProj[12];
  const y =
    invViewProj[1] * ndcX + invViewProj[5] * ndcY + invViewProj[9] * ndcZ + invViewProj[13];
  const z =
    invViewProj[2] * ndcX + invViewProj[6] * ndcY + invViewProj[10] * ndcZ + invViewProj[14];
  const w =
    invViewProj[3] * ndcX + invViewProj[7] * ndcY + invViewProj[11] * ndcZ + invViewProj[15];
  const invW = 1 / w;
  out[0] = x * invW;
  out[1] = y * invW;
  out[2] = z * invW;
}

async function sampleRgb(pngPath: string, x: number, y: number): Promise<number[]> {
  const img = await loadPng(pngPath);
  const view = extractGzdoomView(img.data, img.width, img.height);
  const pf = resizePlayfieldToVanilla(view.data, view.width, view.height);
  const i = (y * 320 + x) * 4;
  return [pf.data[i]!, pf.data[i + 1]!, pf.data[i + 2]!];
}

async function main(): Promise<void> {
  const { wad, map } = loadE1M1();
  const player = map.THINGS.find((t) => t.type === 1)!;
  const geometry = buildMapGeometryCpu(map, buildTextureLookup(map, wad));
  const bspRenderIndex = buildBspRenderIndex(map)!;
  const subsectorFlatObjects = mapToSubsectorFlats(map, bspRenderIndex);
  const sectorVisibility = buildSectorVisibilityIndex(map)!;
  const buffers = {
    bspRenderIndex,
    sectorTriangles: geometry.sectorTriangles,
    triangleHash: geometry.triangleHash,
    sectorVisibility,
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
      map,
    ),
  } as never;

  const layout = computeGzdoomParityViewLayout(640, 480);
  const yaw = (player.angle * Math.PI) / 180;
  const sector = map.SECTORS[29]!;
  const viewState: PlayerViewState = {
    x: player.x,
    y: player.y,
    yaw,
    pitch: FROZEN_GOLD_PARITY_PITCH,
    worldFeetZ: sector.floorheight,
    sector,
  };
  const viewMatrix = mat4.create();
  writePlayerViewMatrix(viewMatrix, viewState);
  const cameraPos = vec3.fromValues(
    player.x,
    getPlayerEyeZ(sector, viewState.worldFeetZ),
    -player.y,
  ) as [number, number, number];

  const projectionMatrix = mat4.create();
  mat4.perspective(
    projectionMatrix,
    (doomVerticalFovDegrees(layout.width, layout.height) / 180) * Math.PI,
    layout.width / layout.height,
    0.1,
    64000,
  );
  const modelViewMatrix = mat4.create();
  mat4.multiply(modelViewMatrix, viewMatrix, mat4.create());
  const modelViewProj = mat4.create();
  mat4.multiply(modelViewProj, projectionMatrix, modelViewMatrix);
  const invViewProj = buildInvViewProj(modelViewProj);

  const drawState = buildGzdoomDrawState({
    map,
    buffers,
    viewX: player.x,
    viewY: player.y,
    viewYaw: yaw,
    cameraPos,
  })!;

  const { wallGlobVis } = globVisFromPlayfield(layout.width, layout.height, layout.width, layout.height);
  const vp = gzdoomViewport(320, 168, yaw);
  const viewX = player.x;
  const viewY = player.y;
  const eyeZ = cameraPos[1];

  console.log(`spawn (${viewX}, ${viewY}) yaw=${player.angle}° pitch=${FROZEN_GOLD_PARITY_PITCH}`);
  console.log(`wallDrawOrder: ${drawState.wallDrawOrder.length} entries\n`);

  const wallByLine = new Map<number, (typeof geometry.walls)[number]>();
  for (const wall of geometry.walls) {
    if (wall.lineIndex != null && wall.lineIndex >= 0) wallByLine.set(wall.lineIndex, wall);
  }

  console.log('=== wall screen spans at y≈60 (draw order) ===');
  for (const entry of drawState.wallDrawOrder) {
    const line = map.LINEDEFS[entry.lineIndex];
    const side = map.SIDEDEFS[entry.sideDefIndex];
    if (!line || !side) continue;
    const v1 = map.VERTEXES[line.v1];
    const v2 = map.VERTEXES[line.v2];
    if (!v1 || !v2) continue;
    const sx1 = gzdoomWallScreenX(v1.x, v1.y, viewX, viewY, vp);
    const sx2 = gzdoomWallScreenX(v2.x, v2.y, viewX, viewY, vp);
    if (sx1 == null && sx2 == null) continue;
    const minSx = Math.min(sx1 ?? Infinity, sx2 ?? Infinity);
    const maxSx = Math.max(sx1 ?? -Infinity, sx2 ?? -Infinity);
    const sz = gzdoomScreenZ((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, viewX, viewY, yaw);
    const bands = hwWallProcessSide({
      map,
      lineDef: line,
      sideDefIndex: entry.sideDefIndex,
      otherSideDefIndex: line.sidenum[0] === entry.sideDefIndex ? line.sidenum[1] : line.sidenum[0],
      texturesByName: buildTextureLookup(map, wad),
    });
    const midBand = bands.find((b) => b.kind === 'mid');
    const tex = midBand?.texName ?? side.midTexture ?? side.upperTexture ?? side.lowerTexture;
    const syTop = gzdoomWallScreenY(midBand?.top ?? side.sector ? map.SECTORS[side.sector]?.ceilingheight ?? 72 : 72, eyeZ, sz, vp);
    const syBot = gzdoomWallScreenY(midBand?.bottom ?? sector.floorheight, eyeZ, sz, vp);
    if (maxSx < 40 || minSx > 280) continue;
    if (Math.max(syTop, syBot) < 40 || Math.min(syTop, syBot) > 90) continue;
    const wallMesh = wallByLine.get(entry.lineIndex);
    const colVis = wallMesh
      ? wallColumnVisibilityRange(map, wallMesh, viewX, viewY, yaw, wallGlobVis)
      : null;
    const light = colormapSectorLightLevel(map.SECTORS[side.sector]!);
    const vis = colVis ? (colVis.visLeft + colVis.visRight) / 2 : wallVisibility(sz, wallGlobVis);
    const bandIdx = gzdoomColormapIndex(light, vis);
    const expectedRgb = shadePalIndex(wad.playpal, wad.colormap, 96, light, vis);
    console.log(
      `  line ${entry.lineIndex} sx=${minSx.toFixed(0)}-${maxSx.toFixed(0)} sy≈${syBot.toFixed(0)}-${syTop.toFixed(0)} ` +
        `tex=${tex} sector=${side.sector} light=${light} vis=${vis.toFixed(3)} band=${bandIdx} → rgb=${expectedRgb.join(',')}`,
    );
  }

  const triangles = buildSceneTriangles(map, buffers, drawState);
  console.log('\n=== probes ===');
  for (const probe of PROBES) {
    const px = Math.round((probe.x / VANILLA_SCREEN_WIDTH) * layout.width);
    const py = Math.round((probe.y / VANILLA_3D_HEIGHT) * layout.height);
    const ndcX = ((px + 0.5) / layout.width) * 2 - 1;
    const ndcY = 1 - ((py + 0.5) / layout.height) * 2;
    const nearPt: [number, number, number] = [0, 0, 0];
    const farPt: [number, number, number] = [0, 0, 0];
    unproject(invViewProj, ndcX, ndcY, -1, nearPt);
    unproject(invViewProj, ndcX, ndcY, 1, farPt);
    const rd: [number, number, number] = [
      farPt[0] - nearPt[0],
      farPt[1] - nearPt[1],
      farPt[2] - nearPt[2],
    ];
    const rdLen = Math.hypot(rd[0], rd[1], rd[2]);
    rd[0] /= rdLen;
    rd[1] /= rdLen;
    rd[2] /= rdLen;

    const hits: Array<{ t: number; tri: SceneTriangle }> = [];
    for (const tri of triangles) {
      const t = rayTriangleHit(nearPt, rd, tri);
      if (t != null) hits.push({ t, tri });
    }
    hits.sort((a, b) => a.t - b.t);

    let gold: number[] = [0, 0, 0];
    let classic: number[] = [0, 0, 0];
    if (fs.existsSync(GOLD)) gold = await sampleRgb(GOLD, probe.x, probe.y);
    if (fs.existsSync(CLASSIC)) classic = await sampleRgb(CLASSIC, probe.x, probe.y);

    console.log(`\n(${probe.x},${probe.y}) ${probe.label}`);
    console.log(`  gold=${gold.join(',')} classic=${classic.join(',')} Δ=${Math.max(...gold.map((v, i) => Math.abs(v - classic[i]!)))}`);
    if (hits.length === 0) {
      console.log('  ray pick: (no geometry — sky/void)');
    } else {
      for (const h of hits.slice(0, 3)) {
        const tri = h.tri;
        console.log(
          `  hit t=${h.t.toFixed(1)} ${tri.surfaceKind === 0 ? 'wall' : tri.surfaceKind === 1 ? 'flat' : 'sprite'} ` +
            `line=${tri.lineIndex ?? -1} tex=${tri.texName} sector=${tri.sectorIndex}`,
        );
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
