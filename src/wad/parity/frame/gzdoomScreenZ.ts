import { wallVisibility } from '@/wad/parity/frame/gzdoomColormap';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { WallBuffer } from '@/wad/interfaces/WallBuffer';

/** GZDoom `FocalTangent` at 90° horizontal FOV (default `fov` CVAR). */
export const GZDOOM_FOCAL_TANGENT = 1;

export interface GzdoomViewport {
  centerX: number;
  centerY: number;
  invZtoScale: number;
  sin: number;
  cos: number;
}

/** ponytail: 90° FOV, focal=1, screenblocks-10 aspect baked in — not full `r_viewport.cpp`. */
export function gzdoomViewport(width: number, height: number, yaw: number): GzdoomViewport {
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  // YaspectMul ≈ 320*viewheight/(200*fullwidth); @640×403 → ~1.0075
  const invZtoScale = centerX * ((320 * height) / (200 * Math.max(width, 1)));
  return { centerX, centerY, invZtoScale, sin: Math.sin(yaw), cos: Math.cos(yaw) };
}

/** Rotate doom XY relative to view (`r_wallsetup.cpp` `tleft`/`tright`). */
export function gzdoomRotateXY(
  dx: number,
  dy: number,
  sin: number,
  cos: number,
): { tX: number; tY: number } {
  const tanCos = GZDOOM_FOCAL_TANGENT * cos;
  const tanSin = GZDOOM_FOCAL_TANGENT * sin;
  return {
    tX: dx * sin - dy * cos,
    tY: dx * tanCos + dy * tanSin,
  };
}

/**
 * GZDoom software wall/sprite screen Z (`tleft.Y` in `r_wallsetup.cpp`).
 * Uses doom XY coords (not WebGL Y-flip).
 */
export function gzdoomScreenZ(
  doomX: number,
  doomY: number,
  viewX: number,
  viewY: number,
  yaw: number,
  focalTangent = GZDOOM_FOCAL_TANGENT,
): number {
  const dx = doomX - viewX;
  const dy = doomY - viewY;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const tanCos = focalTangent * cos;
  const tanSin = focalTangent * sin;
  return dx * tanCos + dy * tanSin;
}

/** Screen X for a wall column at doom vertex; null if behind camera. */
export function gzdoomWallScreenX(
  doomX: number,
  doomY: number,
  viewX: number,
  viewY: number,
  vp: GzdoomViewport,
): number | null {
  const { tX, tY } = gzdoomRotateXY(doomX - viewX, doomY - viewY, vp.sin, vp.cos);
  if (tY <= 1) return null;
  return vp.centerX + (tX * vp.centerX) / tY;
}

/** Screen Y for a world height on a column (`ProjectedWallLine::Project`). */
export function gzdoomWallScreenY(
  worldHeight: number,
  eyeHeight: number,
  sz: number,
  vp: GzdoomViewport,
): number {
  const z = worldHeight - eyeHeight;
  return vp.centerY - (z * vp.invZtoScale) / Math.max(sz, 1);
}

/** Screen point from doom XY + world height. */
export function projectDoomVertex(
  doomX: number,
  doomY: number,
  worldHeight: number,
  eyeHeight: number,
  viewX: number,
  viewY: number,
  vp: GzdoomViewport,
): { sx: number; sy: number; sz: number; depth: number } | null {
  const { tX, tY } = gzdoomRotateXY(doomX - viewX, doomY - viewY, vp.sin, vp.cos);
  if (tY <= 1) return null;
  const sz = tY;
  const sx = vp.centerX + (tX * vp.centerX) / sz;
  const sy = gzdoomWallScreenY(worldHeight, eyeHeight, sz, vp);
  return { sx, sy, sz, depth: 1 / sz };
}

/** GZDoom `r_line.cpp` back-face test (unrotated relative coords). */
export function gzdoomSegFacesViewer(
  v1x: number,
  v1y: number,
  v2x: number,
  v2y: number,
  viewX: number,
  viewY: number,
): boolean {
  const p1x = v1x - viewX;
  const p1y = v1y - viewY;
  const p2x = v2x - viewX;
  const p2y = v2y - viewY;
  return p1y * (p1x - p2x) + p1x * (p2y - p1y) < 0;
}

/** `RenderViewport::PlaneDepth` — FocalLengthY = InvZtoScale when FocalTangent = 1. */
export function gzdoomPlaneDepth(screenY: number, planeHeight: number, vp: GzdoomViewport): number {
  const y = screenY + 0.5;
  const focalY = vp.invZtoScale;
  if (y < vp.centerY) return (focalY / (vp.centerY - y)) * planeHeight;
  return (focalY / (y - vp.centerY)) * planeHeight;
}

/** Inverse screen column → doom XY on a horizontal plane at `distance` (FocalLengthX = centerX). */
export function gzdoomScreenToDoom(
  screenX: number,
  distance: number,
  viewX: number,
  viewY: number,
  vp: GzdoomViewport,
): { doomX: number; doomY: number } {
  const tX = ((screenX + 0.5) - vp.centerX) * distance / vp.centerX;
  const dx = tX * vp.sin + distance * vp.cos;
  const dy = -tX * vp.cos + distance * vp.sin;
  return { doomX: viewX + dx, doomY: viewY + dy };
}

export function doomViewCoordsFromCamera(cameraPos: [number, number, number]): {
  viewX: number;
  viewY: number;
} {
  return { viewX: cameraPos[0], viewY: -cameraPos[2] };
}

export function wallUvRunsRightToLeft(wall: WallBuffer): boolean {
  const u0 = wall.cpuUv[0] ?? 0;
  const u2 = wall.cpuUv[2] ?? 0;
  return u0 > u2;
}

export function wallColumnVisibilityRange(
  map: WadMap,
  wall: WallBuffer,
  viewX: number,
  viewY: number,
  yaw: number,
): { visLeft: number; visRight: number } {
  const line = map.LINEDEFS[wall.lineIndex];
  if (!line) {
    const fallback = wallVisibility(512);
    return { visLeft: fallback, visRight: fallback };
  }
  const v1 = map.VERTEXES[line.v1];
  const v2 = map.VERTEXES[line.v2];
  if (!v1 || !v2) {
    const fallback = wallVisibility(512);
    return { visLeft: fallback, visRight: fallback };
  }

  let visAtV1 = wallVisibility(gzdoomScreenZ(v1.x, v1.y, viewX, viewY, yaw));
  let visAtV2 = wallVisibility(gzdoomScreenZ(v2.x, v2.y, viewX, viewY, yaw));
  if (wallUvRunsRightToLeft(wall)) {
    [visAtV1, visAtV2] = [visAtV2, visAtV1];
  }
  return { visLeft: visAtV1, visRight: visAtV2 };
}

export function spriteColumnVisibility(
  doomX: number,
  doomY: number,
  viewX: number,
  viewY: number,
  yaw: number,
): number {
  return wallVisibility(gzdoomScreenZ(doomX, doomY, viewX, viewY, yaw));
}
