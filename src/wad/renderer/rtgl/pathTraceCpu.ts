import { mat4 } from 'gl-matrix';

import {
  buildTriangleSpatialIndex,
  candidateTrianglesForRay,
  type TriangleSpatialIndex,
} from './pathTraceAccel';
import type { SceneTriangle } from './buildSceneTriangles';
import type { CpuTextureAtlas } from './textureAtlas';
import { sampleCpuAtlas } from './textureAtlas';

const SKY_RGBA = [115, 158, 224, 255] as const;

export interface PathTraceCpuOptions {
  atlas?: CpuTextureAtlas | null;
  wallColors: ReadonlyMap<string, [number, number, number]>;
  floorColors: ReadonlyMap<string, [number, number, number]>;
}

function unproject(
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

function precomputeRays(
  invViewProj: mat4 | Float32Array,
  width: number,
  height: number
): { rayOrigins: Float32Array; rayDirs: Float32Array } {
  const rayOrigins = new Float32Array(width * height * 3);
  const rayDirs = new Float32Array(width * height * 3);
  const nearPt: [number, number, number] = [0, 0, 0];
  const farPt: [number, number, number] = [0, 0, 0];

  for (let py = 0; py < height; py++) {
    const ndcY = 1 - (py + 0.5) / height * 2;
    for (let px = 0; px < width; px++) {
      const ndcX = (px + 0.5) / width * 2 - 1;
      const idx = (py * width + px) * 3;
      unproject(invViewProj, ndcX, ndcY, -1, nearPt);
      unproject(invViewProj, ndcX, ndcY, 1, farPt);
      rayOrigins[idx] = nearPt[0];
      rayOrigins[idx + 1] = nearPt[1];
      rayOrigins[idx + 2] = nearPt[2];
      let rdX = farPt[0] - nearPt[0];
      let rdY = farPt[1] - nearPt[1];
      let rdZ = farPt[2] - nearPt[2];
      const rdLen = Math.hypot(rdX, rdY, rdZ);
      rayDirs[idx] = rdX / rdLen;
      rayDirs[idx + 1] = rdY / rdLen;
      rayDirs[idx + 2] = rdZ / rdLen;
    }
  }

  return { rayOrigins, rayDirs };
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
  v2: [number, number, number],
  bary: [number, number, number]
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
  if (t <= 0.05) return null;
  bary[0] = 1 - u - v;
  bary[1] = u;
  bary[2] = v;
  return t;
}

function shadeHit(
  tri: SceneTriangle,
  bary: [number, number, number],
  hitT: number,
  ro: [number, number, number],
  options: PathTraceCpuOptions,
  sectorLight: ReadonlyArray<number>
): [number, number, number] {
  const hitX = bary[0] * tri.v0[0] + bary[1] * tri.v1[0] + bary[2] * tri.v2[0];
  const hitY = bary[0] * tri.v0[1] + bary[1] * tri.v1[1] + bary[2] * tri.v2[1];
  const hitZ = bary[0] * tri.v0[2] + bary[1] * tri.v1[2] + bary[2] * tri.v2[2];

  const palette = tri.surfaceKind === 1 || tri.surfaceKind === 3 ? options.floorColors : options.wallColors;
  const fallback = palette.get(tri.texName) ?? [0.45, 0.45, 0.45];
  const meshU = bary[0] * tri.uv0[0] + bary[1] * tri.uv1[0] + bary[2] * tri.uv2[0];
  const meshV = bary[0] * tri.uv0[1] + bary[1] * tri.uv1[1] + bary[2] * tri.uv2[1];
  const hitU = tri.surfaceKind === 1 || tri.surfaceKind === 3 ? hitX / 64 : meshU;
  const hitV = tri.surfaceKind === 1 || tri.surfaceKind === 3 ? hitZ / 64 : meshV;
  const rgb = options.atlas
    ? sampleCpuAtlas(options.atlas, tri.texName, tri.surfaceKind, hitU, hitV, fallback)
    : fallback;
  const e1x = tri.v1[0] - tri.v0[0];
  const e1y = tri.v1[1] - tri.v0[1];
  const e1z = tri.v1[2] - tri.v0[2];
  const e2x = tri.v2[0] - tri.v0[0];
  const e2y = tri.v2[1] - tri.v0[1];
  const e2z = tri.v2[2] - tri.v0[2];
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  const fnx = nx / nLen;
  const fny = ny / nLen;
  const fnz = nz / nLen;

  const sectorIndex = Math.max(0, Math.min(255, tri.sectorIndex));
  const light = sectorLight[sectorIndex] ?? 0.75;
  const lightDir = [0.3, 1.0, 0.4] as const;
  const ldLen = Math.hypot(...lightDir);
  const directional = Math.max(0, (fnx * lightDir[0] + fny * lightDir[1] + fnz * lightDir[2]) / ldLen);
  const sideShade = 0.72 + 0.28 * Math.abs(fnx * fnx + fny * fny + fnz * fnz);
  const baseLight = light * (0.42 + 0.58 * directional) ** 1.15 * sideShade;

  const fogDepth = Math.hypot(hitX - ro[0], hitY - ro[1], hitZ - ro[2]);
  const sectorDistanceLight = Math.max(0.12, Math.min(1, 1 - fogDepth / 9600));
  const fogFactor = Math.max(0, Math.min(0.55, (fogDepth - 900) / 2800));
  const fogColor = [0.45, 0.48, 0.52] as const;

  let r = rgb[0] * (0.25 + baseLight * 0.75) * sectorDistanceLight;
  let g = rgb[1] * (0.25 + baseLight * 0.75) * sectorDistanceLight;
  let b = rgb[2] * (0.25 + baseLight * 0.75) * sectorDistanceLight;
  r = r * (1 - fogFactor) + fogColor[0] * fogFactor;
  g = g * (1 - fogFactor) + fogColor[1] * fogFactor;
  b = b * (1 - fogFactor) + fogColor[2] * fogFactor;
  const gamma = 1 / 2.2;
  return [r ** gamma, g ** gamma, b ** gamma];
}

export function renderPathTraceCpu(
  triangles: SceneTriangle[],
  invViewProj: mat4 | Float32Array,
  options: PathTraceCpuOptions,
  sectorLight: ReadonlyArray<number>,
  width: number,
  height: number,
  spatial?: TriangleSpatialIndex | null
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const index = spatial ?? buildTriangleSpatialIndex(triangles);
  const { rayOrigins, rayDirs } = precomputeRays(invViewProj, width, height);
  const bary: [number, number, number] = [0, 0, 0];

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const rayIdx = (py * width + px) * 3;
      const roX = rayOrigins[rayIdx];
      const roY = rayOrigins[rayIdx + 1];
      const roZ = rayOrigins[rayIdx + 2];
      const rdX = rayDirs[rayIdx];
      const rdY = rayDirs[rayIdx + 1];
      const rdZ = rayDirs[rayIdx + 2];

      let triList = candidateTrianglesForRay(roX, roZ, rdX, rdZ, index);
      const useAll = triList.length === 0;

      let bestT = Number.POSITIVE_INFINITY;
      let bestTri = -1;
      const bestBary: [number, number, number] = [0, 0, 0];

      for (let c = 0; c < (useAll ? triangles.length : triList.length); c++) {
        const i = useAll ? c : triList[c];
        const t = rayTriangleHit(
          roX,
          roY,
          roZ,
          rdX,
          rdY,
          rdZ,
          triangles[i].v0,
          triangles[i].v1,
          triangles[i].v2,
          bary
        );
        if (t !== null && t < bestT) {
          bestT = t;
          bestTri = i;
          bestBary[0] = bary[0];
          bestBary[1] = bary[1];
          bestBary[2] = bary[2];
        }
      }

      const off = (py * width + px) * 4;
      if (bestTri < 0) {
        out[off] = SKY_RGBA[0];
        out[off + 1] = SKY_RGBA[1];
        out[off + 2] = SKY_RGBA[2];
        out[off + 3] = SKY_RGBA[3];
        continue;
      }

      const rgb = shadeHit(
        triangles[bestTri],
        bestBary,
        bestT,
        [roX, roY, roZ],
        options,
        sectorLight
      );
      out[off] = Math.min(255, Math.round(rgb[0] * 255));
      out[off + 1] = Math.min(255, Math.round(rgb[1] * 255));
      out[off + 2] = Math.min(255, Math.round(rgb[2] * 255));
      out[off + 3] = 255;
    }
  }

  return out;
}

export function pathTraceCpuResolution(viewWidth: number, viewHeight: number): { width: number; height: number } {
  return {
    width: Math.max(160, Math.round(viewWidth)),
    height: Math.max(84, Math.round(viewHeight)),
  };
}

export function buildInvViewProj(modelViewProjMatrix: mat4, out: mat4 = mat4.create()): mat4 {
  return mat4.invert(out, modelViewProjMatrix);
}

export { unproject as unprojectPoint };
