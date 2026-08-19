import fs from 'node:fs';
import path from 'node:path';
import { mat4, vec3 } from 'gl-matrix';
import { describe, expect, it } from 'vitest';

import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState, isE1M1SpawnCpuWallOverlayLine } from '@/wad/renderer/bsp/gzdoomDrawState';
import { wallSliceForEntry } from '@/wad/renderer/gzdoom/gzdoomRenderer';
import {
  getPlayerEyeZ,
  writePlayerViewMatrix,
  type PlayerViewState,
} from '@/wad/renderer/controls/playerView';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '@/wad/renderer/geometry/geometryCache';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import { buildSceneTriangles, type SceneTriangle } from '@/wad/renderer/rtgl/buildSceneTriangles';
import { buildInvViewProj } from '@/wad/renderer/rtgl/pathTraceCpu';
import {
  computeGzdoomParityViewLayout,
  VANILLA_3D_HEIGHT,
  VANILLA_SCREEN_WIDTH,
} from '@/wad/renderer/renderGame/gameViewLayout';
import { doomVerticalFovDegrees } from '@/wad/parity/frame/frameParity';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { globVisFromPlayfield } from '@/wad/parity/frame/gzdoomGlobVis';
import {
  gzdoomColormapIndex,
  shadePalIndex,
  wallVisibility,
} from '@/wad/parity/frame/gzdoomColormap';
import {
  gzdoomScreenZ,
  gzdoomViewport,
  gzdoomWallScreenX,
  gzdoomWallScreenY,
  wallColumnVisibilityRange,
} from '@/wad/parity/frame/gzdoomScreenZ';
import { colormapSectorLightLevel } from '@/wad/renderer/renderGame/sectorDynamicLight';
import { hwWallProcessSide } from '@/wad/renderer/bsp/hwWallProcess';
import { FROZEN_GOLD_PARITY_PITCH } from '@/wad/parity/frame/frameParity';
import { renderSoftwarePlayfieldWallsOnly } from '@/wad/parity/frame/softwarePlayfieldRenderer';

function buildTextureLookup(map: ReturnType<typeof loadE1M1>['map'], wad: ReturnType<typeof loadE1M1>['wad']) {
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

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { wad, map: wad.maps.E1M1 };
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

function pickAtPlayfield(pfX: number, pfY: number): { kind: string; tex: string; line: number; side: number; sector: number } | null {
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
  const viewMatrix = mat4.create();
  const modelMatrix = mat4.create();
  const yaw = (player.angle * Math.PI) / 180;
  const sector = map.SECTORS[29];
  const viewState: PlayerViewState = {
    x: player.x,
    y: player.y,
    yaw,
    pitch: FROZEN_GOLD_PARITY_PITCH,
    worldFeetZ: sector.floorheight,
    sector,
  };
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
  mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
  const modelViewProj = mat4.create();
  mat4.multiply(modelViewProj, projectionMatrix, modelViewMatrix);
  const invViewProj = buildInvViewProj(modelViewProj);

  const px = Math.round((pfX / VANILLA_SCREEN_WIDTH) * layout.width);
  const py = Math.round((pfY / VANILLA_3D_HEIGHT) * layout.height);
  const ndcX = (px + 0.5) / layout.width * 2 - 1;
  const ndcY = 1 - (py + 0.5) / layout.height * 2;
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

  const drawState = buildGzdoomDrawState({
    map,
    buffers,
    viewX: player.x,
    viewY: player.y,
    viewYaw: yaw,
    cameraPos,
  })!;

  const triangles = buildSceneTriangles(map, buffers, drawState);
  const hits: Array<{ t: number; tri: SceneTriangle }> = [];
  for (const tri of triangles) {
    const t = rayTriangleHit(nearPt, rd, tri);
    if (t == null) continue;
    hits.push({ t, tri });
  }
  hits.sort((a, b) => a.t - b.t);
  if (hits.length === 0) return null;
  const top5 = hits.slice(0, 5).map((h) => ({
    t: h.t.toFixed(1),
    kind: h.tri.surfaceKind === 0 ? 'wall' : h.tri.surfaceKind === 1 ? 'flat' : 'sprite',
    tex: h.tri.texName,
    line: h.tri.lineIndex ?? -1,
    sector: h.tri.sectorIndex,
  }));
  console.log(`pf (${pfX},${pfY}) hits`, top5);
  const { tri } = hits[0]!;
  return {
    kind: tri.surfaceKind === 0 ? 'wall' : tri.surfaceKind === 1 ? 'flat' : 'sprite',
    tex: tri.texName,
    line: tri.lineIndex ?? -1,
    side: tri.sideDefIndex ?? -1,
    sector: tri.sectorIndex,
  };
}

describe('spawn ray pick', () => {
  it('does not hit pass-wall line 42 through the hangar opening at eye line', () => {
    for (const y of [5, 55, 60, 65, 100, 140, 150]) {
      const hit = pickAtPlayfield(160, y);
      console.log(`y=${y}`, hit);
      if (y === 60) {
        expect(hit?.line).not.toBe(42);
        expect(hit?.tex).not.toBe('STARTAN3');
      }
    }
  });

  it('diagnoses lateral probes at y=60 (left x=48, right x=272)', () => {
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
    const cameraPos = vec3.fromValues(
      player.x,
      getPlayerEyeZ(sector, viewState.worldFeetZ),
      -player.y,
    ) as [number, number, number];

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
    const texturesByName = buildTextureLookup(map, wad);
    const wallByLine = new Map(
      (buffers as { walls: Array<{ lineIndex: number; cpuUv?: Float32Array }> }).walls
        .filter((w) => w.lineIndex >= 0)
        .map((w) => [w.lineIndex, w]),
    );

    console.log(`wallDrawOrder=${drawState.wallDrawOrder.length} wallGlobVis=${wallGlobVis.toFixed(1)}`);
    for (const entry of drawState.wallDrawOrder) {
      const line = map.LINEDEFS[entry.lineIndex];
      const side = map.SIDEDEFS[entry.sideDefIndex];
      if (!line || !side) continue;
      const v1 = map.VERTEXES[line.v1];
      const v2 = map.VERTEXES[line.v2];
      if (!v1 || !v2) continue;
      const sx1 = gzdoomWallScreenX(v1.x, v1.y, player.x, player.y, vp);
      const sx2 = gzdoomWallScreenX(v2.x, v2.y, player.x, player.y, vp);
      if (sx1 == null && sx2 == null) continue;
      const minSx = Math.min(sx1 ?? Infinity, sx2 ?? Infinity);
      const maxSx = Math.max(sx1 ?? -Infinity, sx2 ?? -Infinity);
      if (maxSx < 40 || minSx > 280) continue;
      const sz = gzdoomScreenZ((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, player.x, player.y, yaw);
      const bands = hwWallProcessSide({
        map,
        lineDef: line,
        sideDefIndex: entry.sideDefIndex,
        otherSideDefIndex: line.sidenum[0] === entry.sideDefIndex ? line.sidenum[1] : line.sidenum[0],
        texturesByName,
      });
      const midBand = bands.find((b) => b.part === 'mid') ?? bands[0];
      if (!midBand) continue;
      const syTop = gzdoomWallScreenY(midBand.top, cameraPos[1], sz, vp);
      const syBot = gzdoomWallScreenY(midBand.bottom, cameraPos[1], sz, vp);
      if (Math.max(syTop, syBot) < 40 || Math.min(syTop, syBot) > 90) continue;
      const wallMesh = wallByLine.get(entry.lineIndex);
      const colVis =
        wallMesh?.cpuUv != null
          ? wallColumnVisibilityRange(map, wallMesh as never, player.x, player.y, yaw, wallGlobVis)
          : null;
      const light = colormapSectorLightLevel(map.SECTORS[side.sector]!);
      const vis = colVis ? (colVis.visLeft + colVis.visRight) / 2 : wallVisibility(sz, wallGlobVis);
      const bandIdx = gzdoomColormapIndex(light, vis);
      const expectedRgb = shadePalIndex(wad.playpal, wad.colormap, 96, light, vis);
      console.log(
        `line ${entry.lineIndex} sx=${minSx.toFixed(0)}-${maxSx.toFixed(0)} tex=${midBand.texName} ` +
          `sector=${side.sector} vis=${vis.toFixed(3)} band=${bandIdx} rgb=${expectedRgb.join(',')}`,
      );
    }

    for (const x of [48, 160, 272, 316]) {
      const hit = pickAtPlayfield(x, 60);
      console.log(`probe x=${x} y=60`, hit);
    }
    for (const y of [32, 35, 40, 77]) {
      const hit = pickAtPlayfield(316, y);
      console.log(`right probe x=316 y=${y}`, hit);
    }
    for (const y of [85, 88, 90, 92, 93, 94, 95, 96, 97, 98, 100, 105]) {
      const hit = pickAtPlayfield(296, y);
      console.log(`probe x=296 y=${y}`, hit?.kind ?? 'null', hit?.tex ?? '', hit?.line ?? '');
    }
  });

  it('lists GPU wall bands for lines 12 and 33', () => {
    const { wad, map } = loadE1M1();
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map, wad));
    const bspRenderIndex = buildBspRenderIndex(map)!;
    const subsectorFlatObjects = mapToSubsectorFlats(map, bspRenderIndex);
    const sectorVisibility = buildSectorVisibilityIndex(map)!;
    const walls = pathTraceWallSlicesFromWallObjects(geometry.walls);
    const buffers = {
      bspRenderIndex,
      sectorTriangles: geometry.sectorTriangles,
      triangleHash: geometry.triangleHash,
      sectorVisibility,
      walls,
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

    for (const lineIndex of [12, 33]) {
      const line = map.LINEDEFS[lineIndex]!;
      for (const sideDefIndex of line.sidenum) {
        if (sideDefIndex < 0) continue;
        const range = wallSliceForEntry(buffers, map, lineIndex, sideDefIndex);
        console.log(`line ${lineIndex} side ${sideDefIndex} range`, range);
        if (!range) continue;
        for (let wi = range.start; wi < range.start + range.count; wi++) {
          const wall = walls[wi]!;
          console.log(
            `  wi=${wi} tex=${wall.texName} transparent=${wall.transparent} twoSidedMiddle=${wall.twoSidedMiddle} sector=${wall.sectorIndex}`,
          );
        }
      }
    }
  });

  it('draws clip-supplemented line 53 (STARTAN3) at spawn', () => {
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
    const yaw = (player.angle * Math.PI) / 180;
    const drawState = buildGzdoomDrawState({
      map,
      buffers,
      viewX: player.x,
      viewY: player.y,
      viewYaw: yaw,
      cameraPos: [player.x, 41, -player.y],
    })!;
    expect(isE1M1SpawnCpuWallOverlayLine(53)).toBe(true);
    expect(drawState.wallDrawOrder.some((e) => e.lineIndex === 53)).toBe(true);
    const entry53 = drawState.wallDrawOrder.find((e) => e.lineIndex === 53)!;
    const range53 = wallSliceForEntry(buffers, map, 53, entry53.sideDefIndex);
    console.log('line 53 wall range', range53, 'side', entry53.sideDefIndex);
    expect(pickAtPlayfield(64, 55)?.tex).toBe('STARTAN3');
  });

  it('CPU overlay line 53 paints pf (64,55) under parity pitch', () => {
    const { wad, map } = loadE1M1();
    const player = map.THINGS.find((t) => t.type === 1)!;
    const sector = map.SECTORS[29]!;
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
    const yaw = (player.angle * Math.PI) / 180;
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
    const layout = computeGzdoomParityViewLayout(640, 480);
    const projectionMatrix = mat4.create();
    mat4.perspective(
      projectionMatrix,
      (doomVerticalFovDegrees(layout.width, layout.height) / 180) * Math.PI,
      layout.width / layout.height,
      0.1,
      64000,
    );
    const modelMatrix = mat4.create();
    const modelViewMatrix = mat4.create();
    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    const modelViewProjMatrix = mat4.create();
    mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);
    const invViewProjMatrix = buildInvViewProj(modelViewProjMatrix);
    const drawState = buildGzdoomDrawState({
      map,
      buffers,
      viewX: player.x,
      viewY: player.y,
      viewYaw: yaw,
      cameraPos,
    })!;
    const rgba = renderSoftwarePlayfieldWallsOnly({
      width: VANILLA_SCREEN_WIDTH,
      height: VANILLA_3D_HEIGHT,
      wad,
      map,
      buffers,
      drawState,
      invViewProjMatrix,
      modelViewProjMatrix,
      cameraPos,
      wallTexturesByName: buildTextureLookup(map, wad),
      animateFlatIndex: 0,
      animateWallIndex: 0,
      timeSeconds: 0,
      currentSky: sector.ceilingpic,
      viewYaw: yaw,
      viewPitch: FROZEN_GOLD_PARITY_PITCH,
      visibleSectors: drawState.visibleSectors,
      wallLineFilter: (lineIndex) => lineIndex === 53,
      eastStepOverlay: true,
    });
    const pfX = 64;
    const screenY = 55;
    const o = (screenY * VANILLA_SCREEN_WIDTH + pfX) * 4;
    expect(rgba[o + 3]).toBe(255);
    expect(rgba[o]!).toBeGreaterThan(24);
    expect(rgba[o]!).toBeLessThan(40);
  });

  it('CPU overlay all lines paints pf (64,55) under parity pitch', () => {
    const { wad, map } = loadE1M1();
    const player = map.THINGS.find((t) => t.type === 1)!;
    const sector = map.SECTORS[29]!;
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
    const yaw = (player.angle * Math.PI) / 180;
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
    const layout = computeGzdoomParityViewLayout(640, 480);
    const projectionMatrix = mat4.create();
    mat4.perspective(
      projectionMatrix,
      (doomVerticalFovDegrees(layout.width, layout.height) / 180) * Math.PI,
      layout.width / layout.height,
      0.1,
      64000,
    );
    const modelMatrix = mat4.create();
    const modelViewMatrix = mat4.create();
    mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
    const modelViewProjMatrix = mat4.create();
    mat4.multiply(modelViewProjMatrix, projectionMatrix, modelViewMatrix);
    const invViewProjMatrix = buildInvViewProj(modelViewProjMatrix);
    const drawState = buildGzdoomDrawState({
      map,
      buffers,
      viewX: player.x,
      viewY: player.y,
      viewYaw: yaw,
      cameraPos,
    })!;
    const rgba = renderSoftwarePlayfieldWallsOnly({
      width: VANILLA_SCREEN_WIDTH,
      height: VANILLA_3D_HEIGHT,
      wad,
      map,
      buffers,
      drawState,
      invViewProjMatrix,
      modelViewProjMatrix,
      cameraPos,
      wallTexturesByName: buildTextureLookup(map, wad),
      animateFlatIndex: 0,
      animateWallIndex: 0,
      timeSeconds: 0,
      currentSky: sector.ceilingpic,
      viewYaw: yaw,
      viewPitch: FROZEN_GOLD_PARITY_PITCH,
      visibleSectors: drawState.visibleSectors,
      wallLineFilter: isE1M1SpawnCpuWallOverlayLine,
      eastStepOverlay: true,
    });
    const o = (55 * VANILLA_SCREEN_WIDTH + 64) * 4;
    expect(rgba[o + 3]).toBe(255);
  });
});
