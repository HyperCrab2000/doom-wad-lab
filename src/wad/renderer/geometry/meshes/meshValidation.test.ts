import { describe, expect, it } from 'vitest';

import {
  buildMeshGeometry,
  buildRandomSectorSamples,
  loadWadMap,
  MESH_VALIDATION_SAMPLE_COUNT,
} from '@/wad/renderer/geometry/meshes/meshTestHarness';
import {
  flatsForSubsector,
  subsectorIndicesForSector,
  validateSubsectorFlatMesh,
} from '@/wad/renderer/geometry/meshes/validateFlatMesh';
import { validateWallMesh, wallsForSector } from '@/wad/renderer/geometry/meshes/validateWallMesh';

describe('meshes', () => {
  describe('wall mesh invariants', () => {
    it('validates E1M1 player sector walls against linedef geometry', () => {
      const map = loadWadMap('DOOM.WAD', 'E1M1');
      const { geometry } = buildMeshGeometry(map);
      const player = map.THINGS.find((thing) => thing.type === 1)!;
      const sectorIndex = findSectorAt(map, player.x, player.y);
      const walls = wallsForSector(geometry.walls, sectorIndex);

      expect(walls.length).toBeGreaterThan(0);
      for (const wall of walls) {
        const result = validateWallMesh(map, wall);
        expect(result.ok, result.ok ? '' : `${result.code}: ${result.detail}`).toBe(true);
      }
    });
  });

  describe('subsector flat mesh invariants', () => {
    it('matches GZDoom fan triangulation for MAP01 subsectors', () => {
      const map = loadWadMap('DOOM2.WAD', 'MAP01');
      const { subsectorFlats, bspRenderIndex } = buildMeshGeometry(map);

      let checked = 0;
      for (let subsectorIndex = 0; subsectorIndex < bspRenderIndex.subsectorSegs.length; subsectorIndex++) {
        const segIndices = bspRenderIndex.subsectorSegs[subsectorIndex];
        if (!segIndices || segIndices.length < 3) continue;
        for (const flat of flatsForSubsector(subsectorFlats, subsectorIndex)) {
          const result = validateSubsectorFlatMesh(map, flat, segIndices);
          expect(result.ok, result.ok ? '' : `${result.code}: ${result.detail}`).toBe(true);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(100);
    });
  });

  describe('random sector sample across Doom + Doom 2', () => {
    const samples = buildRandomSectorSamples(MESH_VALIDATION_SAMPLE_COUNT);

    it(`samples ${MESH_VALIDATION_SAMPLE_COUNT} sectors from both IWADs`, () => {
      expect(samples.length).toBe(MESH_VALIDATION_SAMPLE_COUNT);
      expect(new Set(samples.map((s) => s.wadName)).size).toBe(2);
    });

    it.each(samples.map((sample, index) => [index, sample] as const))(
      'sector %i (%s/%s #%s) wall + flat meshes match map data',
      (_index, sample) => {
        const map = loadWadMap(sample.wadName, sample.mapName);
        const { geometry, subsectorFlats, bspRenderIndex } = buildMeshGeometry(map);
        const sectorIndex = sample.sectorIndex;

        const walls = wallsForSector(geometry.walls, sectorIndex);
        for (const wall of walls) {
          const result = validateWallMesh(map, wall);
          expect(result.ok, result.ok ? '' : `${result.code}: ${result.detail}`).toBe(true);
        }

        for (const subsectorIndex of subsectorIndicesForSector(bspRenderIndex, sectorIndex)) {
          const segIndices = bspRenderIndex.subsectorSegs[subsectorIndex];
          if (!segIndices || segIndices.length < 3) continue;
          for (const flat of flatsForSubsector(subsectorFlats, subsectorIndex)) {
            const result = validateSubsectorFlatMesh(map, flat, segIndices);
            expect(result.ok, result.ok ? '' : `${result.code}: ${result.detail}`).toBe(true);
          }
        }
      }
    );
  });
});

function findSectorAt(map: ReturnType<typeof loadWadMap>, x: number, y: number): number {
  for (let lineIndex = 0; lineIndex < map.LINEDEFS.length; lineIndex++) {
    const line = map.LINEDEFS[lineIndex]!;
    const sideIndex = line.sidenum[0];
    if (sideIndex < 0) continue;
    const side = map.SIDEDEFS[sideIndex];
    if (!side) continue;
    const v1 = map.VERTEXES[line.v1];
    const v2 = map.VERTEXES[line.v2];
    if (!v1 || !v2) continue;
    if (pointNearSegment(x, y, v1.x, v1.y, v2.x, v2.y, 8)) {
      return side.sector;
    }
  }
  return map.SIDEDEFS[0]?.sector ?? 0;
}

function pointNearSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - x1, py - y1) <= radius;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy) <= radius;
}
