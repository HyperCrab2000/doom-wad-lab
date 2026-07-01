import { skyFlats } from '@/wad/constants/WadInfo';
import type { FlatObject } from '@/wad/interfaces/FlatObject';
import type { Triangle } from '@/wad/interfaces/Triangle';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { subsectorToTriangles } from '@/wad/renderer/geometry/subsectorToTriangles';

const EPS = 0.05;

export interface MeshValidationIssue {
  ok: false;
  code: string;
  detail: string;
}

export type FlatMeshValidation = { ok: true } | MeshValidationIssue;

export function validateSubsectorFlatMesh(
  map: WadMap,
  flat: FlatObject,
  segIndices: readonly number[]
): FlatMeshValidation {
  const sector = flat.sector;
  if (!sector) {
    return { ok: false, code: 'flat_missing_sector', detail: 'flat has no sector' };
  }

  const isCeiling = Math.abs(flat.position[1]! - sector.ceilingheight) < Math.abs(flat.position[1]! - sector.floorheight);
  const expectedHeight = isCeiling ? sector.ceilingheight : sector.floorheight;

  if (!heightMatches(flat, expectedHeight)) {
    return {
      ok: false,
      code: 'flat_wrong_height',
      detail: `flat Y ~${flat.position[1]} expected ${expectedHeight}`,
    };
  }

  const expectedPic = isCeiling ? sector.ceilingpic : sector.floorpic;
  if (skyFlats.indexOf(expectedPic) >= 0) {
    return { ok: true };
  }

  if (flat.flatName !== expectedPic) {
    return {
      ok: false,
      code: 'flat_texture_mismatch',
      detail: `flat ${flat.flatName} != sector ${expectedPic}`,
    };
  }

  const expectedTris = subsectorToTriangles(map, segIndices);
  if (expectedTris.length === 0) {
    return { ok: false, code: 'flat_empty_subsector', detail: 'subsector triangulation empty' };
  }

  const actualTris = extractTrianglesFromFlatMesh(flat, expectedHeight);
  if (actualTris.length !== expectedTris.length) {
    return {
      ok: false,
      code: 'flat_tri_count',
      detail: `mesh ${actualTris.length} tris != expected ${expectedTris.length}`,
    };
  }

  for (const expected of expectedTris) {
    if (!actualTris.some((actual) => trianglesMatch(expected, actual, expectedHeight, EPS))) {
      return {
        ok: false,
        code: 'flat_tri_mismatch',
        detail: `missing triangle (${expected[0].x},${expected[0].y})-(${expected[1].x},${expected[1].y})-(${expected[2].x},${expected[2].y})`,
      };
    }
  }

  return { ok: true };
}

export function subsectorIndicesForSector(index: BspRenderIndex, sectorIndex: number): number[] {
  const out: number[] = [];
  for (let subsectorIndex = 0; subsectorIndex < index.subsectorToSector.length; subsectorIndex++) {
    if (index.subsectorToSector[subsectorIndex] === sectorIndex) out.push(subsectorIndex);
  }
  return out;
}

export function flatsForSubsector(flats: FlatObject[], subsectorIndex: number): FlatObject[] {
  return flats.filter((flat) => flat.subsectorIndex === subsectorIndex);
}

function heightMatches(flat: FlatObject, height: number): boolean {
  for (let i = 0; i < flat.position.length; i += 3) {
    if (Math.abs(flat.position[i + 1]! - height) > EPS) return false;
  }
  return true;
}

function extractTrianglesFromFlatMesh(
  flat: FlatObject,
  height: number
): Array<[[number, number, number], [number, number, number], [number, number, number]]> {
  const tris: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [];
  const pos = flat.position;
  const idx = flat.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const verts = [idx[i]!, idx[i + 1]!, idx[i + 2]!].map((vi) =>
      pointFromFlat(flat, vi, height)
    ) as [[number, number, number], [number, number, number], [number, number, number]];
    tris.push(verts);
  }
  return tris;
}

function pointFromFlat(flat: FlatObject, vi: number, height: number): [number, number, number] {
  return [flat.position[vi * 3]!, height, flat.position[vi * 3 + 2]!];
}

function trianglesMatch(
  expected: Triangle,
  actual: [[number, number, number], [number, number, number], [number, number, number]],
  height: number,
  eps: number
): boolean {
  const expPoints: Array<[number, number, number]> = expected.map((v) => [v.x, height, -v.y]);
  return (
    pointsEqual(expPoints[0]!, actual[0], eps) &&
    pointsEqual(expPoints[1]!, actual[1], eps) &&
    pointsEqual(expPoints[2]!, actual[2], eps)
  ) || (
    pointsEqual(expPoints[0]!, actual[0], eps) &&
    pointsEqual(expPoints[1]!, actual[2], eps) &&
    pointsEqual(expPoints[2]!, actual[1], eps)
  ) || (
    pointsEqual(expPoints[0]!, actual[1], eps) &&
    pointsEqual(expPoints[1]!, actual[2], eps) &&
    pointsEqual(expPoints[2]!, actual[0], eps)
  ) || (
    pointsEqual(expPoints[0]!, actual[1], eps) &&
    pointsEqual(expPoints[1]!, actual[0], eps) &&
    pointsEqual(expPoints[2]!, actual[2], eps)
  ) || (
    pointsEqual(expPoints[0]!, actual[2], eps) &&
    pointsEqual(expPoints[1]!, actual[0], eps) &&
    pointsEqual(expPoints[2]!, actual[1], eps)
  ) || (
    pointsEqual(expPoints[0]!, actual[2], eps) &&
    pointsEqual(expPoints[1]!, actual[1], eps) &&
    pointsEqual(expPoints[2]!, actual[0], eps)
  );
}

function pointsEqual(
  a: [number, number, number],
  b: [number, number, number],
  eps: number
): boolean {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps && Math.abs(a[2] - b[2]) <= eps;
}
