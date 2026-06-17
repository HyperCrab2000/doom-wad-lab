import { mat4 } from 'gl-matrix';

import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import type { GzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import type { WallDrawEntry } from '@/wad/renderer/bsp/bspVisibility';
import type { WadMap } from '@/wad/interfaces/WadMap';
import {
  buildTriangleSpatialIndex,
  candidateTrianglesForRay,
  type TriangleSpatialIndex,
} from './pathTraceAccel';
import type { SceneTriangle } from './buildSceneTriangles';
import { SURFACE_FLAT_CEILING, SURFACE_FLAT_FLOOR, SURFACE_WALL } from './pathTraceConstants';
import { isSkySector } from '@/wad/renderer/utils/sectorSkyVisibility';
import { sectorsSharePortalLine } from '@/wad/renderer/utils/sectorVisibility';

function unprojectPoint(
  invViewProj: mat4 | Float32Array,
  ndcX: number,
  ndcY: number,
  ndcZ: number,
  out: [number, number, number]
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

export interface CollectRayTracedVisibleOptions {
  sampleStep?: number;
  surfaceMask?: number;
  /** Masked midtextures block rays when true (wireframe portal cull). Default false. */
  occludeAlphaClip?: boolean;
  /** Reuse a spatial index built for this triangle set (avoids per-pass rebuild). */
  spatial?: TriangleSpatialIndex;
}

export interface RayTraceVisibleGeometry {
  sectors: Set<number>;
  wallKeys: Set<string>;
  subsectors: Set<number>;
}

function wallEntryKey(lineIndex: number, sideDefIndex: number): string {
  return `${lineIndex}:${sideDefIndex}`;
}

function passesSurfaceMask(surfaceKind: number, mask: number): boolean {
  if (surfaceKind === SURFACE_WALL) return (mask & 1) !== 0;
  if (surfaceKind === SURFACE_FLAT_FLOOR) return (mask & 2) !== 0;
  if (surfaceKind === SURFACE_FLAT_CEILING) return (mask & 4) !== 0;
  return true;
}

function isFrontFacing(
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number],
  rdX: number,
  rdY: number,
  rdZ: number,
  surfaceKind: number
): boolean {
  if (surfaceKind !== SURFACE_WALL) return true;
  const e1x = v1[0] - v0[0];
  const e1y = v1[1] - v0[1];
  const e1z = v1[2] - v0[2];
  const e2x = v2[0] - v0[0];
  const e2y = v2[1] - v0[1];
  const e2z = v2[2] - v0[2];
  const fnx = e1y * e2z - e1z * e2y;
  const fny = e1z * e2x - e1x * e2z;
  const fnz = e1x * e2y - e1y * e2x;
  return fnx * rdX + fny * rdY + fnz * rdZ <= 0;
}

function rayTriangleHit(
  roX: number,
  roY: number,
  roZ: number,
  rdX: number,
  rdY: number,
  rdZ: number,
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number]
): number | null {
  const e1x = v1[0] - v0[0];
  const e1y = v1[1] - v0[1];
  const e1z = v1[2] - v0[2];
  const e2x = v2[0] - v0[0];
  const e2y = v2[1] - v0[1];
  const e2z = v2[2] - v0[2];
  const px = rdY * e2z - rdZ * e2y;
  const py = rdZ * e2x - rdX * e2z;
  const pz = rdX * e2y - rdY * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-6) return null;
  const invDet = 1 / det;
  const tvx = roX - v0[0];
  const tvy = roY - v0[1];
  const tvz = roZ - v0[2];
  const u = (tvx * px + tvy * py + tvz * pz) * invDet;
  if (u < 0 || u > 1) return null;
  const qx = tvy * e1z - tvz * e1y;
  const qy = tvz * e1x - tvx * e1z;
  const qz = tvx * e1y - tvy * e1x;
  const v = (rdX * qx + rdY * qy + rdZ * qz) * invDet;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  if (t <= 0.001) return null;
  return t;
}

function recordTriangleHit(out: RayTraceVisibleGeometry, tri: SceneTriangle): void {
  if (tri.sectorIndex >= 0) {
    out.sectors.add(tri.sectorIndex);
  }
  if (tri.lineIndex !== undefined && tri.sideDefIndex !== undefined) {
    out.wallKeys.add(wallEntryKey(tri.lineIndex, tri.sideDefIndex));
  }
  if (tri.subsectorIndex !== undefined && tri.subsectorIndex >= 0) {
    out.subsectors.add(tri.subsectorIndex);
  }
}

function castPrimaryRay(
  triangles: readonly SceneTriangle[],
  spatial: TriangleSpatialIndex,
  invViewProj: mat4 | Float32Array,
  ndcX: number,
  ndcY: number,
  surfaceMask: number,
  occludeAlphaClip: boolean
): SceneTriangle | null {
  const nearPt: [number, number, number] = [0, 0, 0];
  const farPt: [number, number, number] = [0, 0, 0];
  unprojectPoint(invViewProj, ndcX, ndcY, -1, nearPt);
  unprojectPoint(invViewProj, ndcX, ndcY, 1, farPt);
  const roX = nearPt[0];
  const roY = nearPt[1];
  const roZ = nearPt[2];
  let rdX = farPt[0] - roX;
  let rdY = farPt[1] - roY;
  let rdZ = farPt[2] - roZ;
  const rdLen = Math.hypot(rdX, rdY, rdZ);
  rdX /= rdLen;
  rdY /= rdLen;
  rdZ /= rdLen;

  const triList = candidateTrianglesForRay(roX, roZ, rdX, rdZ, spatial);
  const useAll = triList.length === 0;

  let bestT = Number.POSITIVE_INFINITY;
  let bestTri: SceneTriangle | null = null;

  for (let c = 0; c < (useAll ? triangles.length : triList.length); c++) {
    const i = useAll ? c : triList[c]!;
    const tri = triangles[i]!;
    if (tri.alphaClip && !occludeAlphaClip) continue;
    if (!passesSurfaceMask(tri.surfaceKind, surfaceMask)) continue;
    const t = rayTriangleHit(roX, roY, roZ, rdX, rdY, rdZ, tri.v0, tri.v1, tri.v2);
    if (t === null || t >= bestT) continue;
    if (!isFrontFacing(tri.v0, tri.v1, tri.v2, rdX, rdY, rdZ, tri.surfaceKind)) continue;
    bestT = t;
    bestTri = tri;
  }

  return bestTri;
}

export function createEmptyRayTraceVisibleGeometry(): RayTraceVisibleGeometry {
  return {
    sectors: new Set<number>(),
    wallKeys: new Set<string>(),
    subsectors: new Set<number>(),
  };
}

/** Primary-ray hits: exact wall linedefs + subsector flats the GPU tracer would shade. */
export function collectRayTracedVisibleGeometry(
  triangles: readonly SceneTriangle[],
  invViewProj: mat4 | Float32Array,
  width: number,
  height: number,
  options: CollectRayTracedVisibleOptions = {}
): RayTraceVisibleGeometry {
  const sampleStep = Math.max(1, options.sampleStep ?? 2);
  const surfaceMask = options.surfaceMask ?? 7;
  const occludeAlphaClip = options.occludeAlphaClip ?? false;
  const out = createEmptyRayTraceVisibleGeometry();
  if (triangles.length === 0 || width <= 0 || height <= 0) {
    return out;
  }

  const spatial = options.spatial ?? buildTriangleSpatialIndex(triangles);
  for (let py = 0; py < height; py += sampleStep) {
    const ndcY = 1 - (py + 0.5) / height * 2;
    for (let px = 0; px < width; px += sampleStep) {
      const ndcX = (px + 0.5) / width * 2 - 1;
      const hit = castPrimaryRay(
        triangles,
        spatial,
        invViewProj,
        ndcX,
        ndcY,
        surfaceMask,
        occludeAlphaClip
      );
      if (hit) {
        recordTriangleHit(out, hit);
      }
    }
  }

  return out;
}

/** @deprecated Use collectRayTracedVisibleGeometry */
export function collectRayTracedVisibleSectors(
  triangles: readonly SceneTriangle[],
  invViewProj: mat4 | Float32Array,
  width: number,
  height: number,
  options: CollectRayTracedVisibleOptions = {}
): Set<number> {
  return collectRayTracedVisibleGeometry(triangles, invViewProj, width, height, options).sectors;
}

export function extendRayTraceGeometryCourtyardLips(
  map: WadMap,
  sectorVisibility: { sectorAdjacency: readonly (readonly number[])[] } | null | undefined,
  drawState: GzdoomDrawState,
  index: BspRenderIndex,
  geom: RayTraceVisibleGeometry,
  enableCourtyardLips = true
): void {
  if (!enableCourtyardLips) return;
  const hitIndoorSectors = new Set<number>();
  for (const subsectorIndex of geom.subsectors) {
    const sectorIndex = index.subsectorToSector[subsectorIndex] ?? -1;
    if (sectorIndex >= 0 && !isSkySector(map, sectorIndex)) {
      hitIndoorSectors.add(sectorIndex);
    }
  }
  for (const sectorIndex of geom.sectors) {
    if (!isSkySector(map, sectorIndex)) {
      hitIndoorSectors.add(sectorIndex);
    }
  }

  for (const subsectorIndex of drawState.bspFlatSubsectorOrder) {
    const sectorIndex = index.subsectorToSector[subsectorIndex] ?? -1;
    if (!isSkySector(map, sectorIndex) || geom.subsectors.has(subsectorIndex)) continue;

    for (const neighbor of sectorVisibility?.sectorAdjacency[sectorIndex] ?? []) {
      if (!hitIndoorSectors.has(neighbor) || isSkySector(map, neighbor)) continue;
      if (!sectorsSharePortalLine(map, neighbor, sectorIndex)) continue;
      geom.subsectors.add(subsectorIndex);
      geom.sectors.add(sectorIndex);
      break;
    }
  }
}

export function buildInvViewProjFromModelViewProj(
  modelViewProjMatrix: mat4 | Float32Array,
  out: mat4 = mat4.create()
): mat4 {
  return mat4.invert(out, modelViewProjMatrix as mat4) ?? out;
}
