import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import {
  areCourtyardWindowPair,
  checkCourtyardSnapshot,
  checkDrawInvariants,
  hasSingleCourtyardOpening,
  shouldApplyCourtyardConnectivityRules,
  type CourtyardInvariantViolation,
} from '@/wad/renderer/courtyard/courtyardInvariants';
import {
  discoverCourtyardIslands,
  discoverCourtyardsInWad,
} from '@/wad/renderer/courtyard/discoverCourtyards';
import {
  COURTYARD_PROBE_YAWS,
  createCourtyardProbeContext,
  islandForCameraSector,
  probeCourtyardVisibility,
} from '@/wad/renderer/courtyard/probeCourtyardVisibility';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import {
  buildWallRangesByLineAndSide,
  pathTraceWallSlicesFromWallObjects,
} from '@/wad/renderer/geometry/geometryCache';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { countGzdoomMeshWireframeSegments } from '@/wad/renderer/modular/drawGzdoomMeshWireframe';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';

function loadWad(relativePath: string) {
  const wadPath = path.resolve(process.cwd(), relativePath);
  const buf = fs.readFileSync(wadPath);
  return loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

function formatViolations(violations: CourtyardInvariantViolation[]): string {
  return violations
    .slice(0, 12)
    .map((v) => `[${v.rule}] ${v.detail}`)
    .join('\n');
}

function runCourtyardSuite(wadPath: string, wadLabel: string) {
  describe(`${wadLabel} courtyard visibility`, () => {
    const wad = loadWad(wadPath);
    const analyses = discoverCourtyardsInWad(wad);

    it('discovers at least one courtyard island', () => {
      expect(analyses.length).toBeGreaterThan(0);
    });

    it(
      'passes GZDoom BSP flat draw contract at every probe and yaw',
      () => {
      const violations: CourtyardInvariantViolation[] = [];

      for (const analysis of analyses) {
        const ctx = createCourtyardProbeContext(wad.maps[analysis.mapName], analysis);
        if (!ctx) continue;

        for (const probe of analysis.probes) {
          for (const viewYaw of COURTYARD_PROBE_YAWS) {
            const snapshot = probeCourtyardVisibility(ctx, probe, viewYaw);
            if (!snapshot) continue;

            violations.push(
              ...checkDrawInvariants(
                snapshot.probe,
                snapshot.viewYaw,
                snapshot.cameraSectorIndex,
                snapshot.bspFlatVisible,
                snapshot.connectivityVisible,
                snapshot.drawVisible,
                snapshot.flatDrawMode
              )
            );
          }
        }
      }

      expect(violations, formatViolations(violations)).toEqual([]);
      },
      120_000
    );

    it(
      'passes courtyard connectivity rules when the camera has a single outdoor opening',
      () => {
      const violations: CourtyardInvariantViolation[] = [];

      for (const analysis of analyses) {
        const ctx = createCourtyardProbeContext(wad.maps[analysis.mapName], analysis);
        if (!ctx) continue;

        for (const probe of analysis.probes) {
          for (const viewYaw of COURTYARD_PROBE_YAWS) {
            const snapshot = probeCourtyardVisibility(ctx, probe, viewYaw);
            if (!snapshot) continue;

            const island = islandForCameraSector(
              ctx.map,
              analysis,
              snapshot.cameraSectorIndex
            );
            if (!island) continue;

            violations.push(
              ...checkCourtyardSnapshot(
                ctx.map,
                analysis.index,
                analysis.skyIslandIds,
                island,
                snapshot,
                {
                  connectivityRules: shouldApplyCourtyardConnectivityRules(
                    ctx.map,
                    analysis.index,
                    analysis.skyIslandIds,
                    probe,
                    snapshot.cameraSectorIndex
                  ),
                }
              ).filter((v) => !v.rule.startsWith('draw-'))
            );
          }
        }
      }

      expect(violations, formatViolations(violations)).toEqual([]);
      },
      120_000
    );
  });
}

describe('courtyard discovery (E1M1)', () => {
  it('finds the hangar/courtyard split as separate sky islands', () => {
    const wad = loadWad('public/wads/DOOM.WAD');
    const analysis = discoverCourtyardIslands(wad.maps.E1M1, 'E1M1')!;

    expect(analysis.islands.length).toBeGreaterThanOrEqual(2);
    const multiSky = analysis.islands.filter((island) => island.skySectors.length >= 2);
    expect(multiSky.length).toBeGreaterThan(0);

    const courtyardIsland = analysis.islands.find((island) =>
      island.skySectors.includes(42)
    );
    expect(courtyardIsland).toBeDefined();
    expect(courtyardIsland!.windowRooms).toContain(43);
    expect(
      areCourtyardWindowPair(wad.maps.E1M1, analysis.index, courtyardIsland!, 43, 41)
    ).toBe(true);
  });

  it('recognizes E1M1 window rooms 43 and 41 as a courtyard pair', () => {
    const wad = loadWad('public/wads/DOOM.WAD');
    const analysis = discoverCourtyardIslands(wad.maps.E1M1, 'E1M1')!;
    const island = analysis.islands.find((entry) => entry.skySectors.includes(42))!;

    expect(
      areCourtyardWindowPair(wad.maps.E1M1, analysis.index, island, 43, 41)
    ).toBe(true);
  });
});

describe('E1M1 golden courtyard cases (GZDoom BSP subsector flats)', () => {
  const wad = loadWad('public/wads/DOOM.WAD');
  const map = wad.maps.E1M1;
  const index = buildSectorVisibilityIndex(map)!;
  const bspIndex = buildBspRenderIndex(map)!;
  const subsectorFlats = mapToSubsectorFlats(map, bspIndex);

  function buildTextureLookup() {
    const texNames = new Set<string>();
    for (const side of map.SIDEDEFS) {
      for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
        if (tex && tex !== '-') texNames.add(tex);
      }
    }
    const texturesByName: Record<
      string,
      { name: string; width: number; height: number; transparent: boolean; graphics: never }
    > = {};
    for (const name of texNames) {
      texturesByName[name] = { name, width: 64, height: 128, transparent: false, graphics: {} as never };
    }
    return texturesByName;
  }

  function buildCourtyardWireframeBuffers() {
    const geometry = buildMapGeometryCpu(map, buildTextureLookup());
    return {
      bspRenderIndex: bspIndex,
      sectorVisibility: index,
      sectorTriangles: {},
      triangleHash: null,
      wallRangesByLine: [],
      flats: [],
      subsectorFlats,
      walls: pathTraceWallSlicesFromWallObjects(geometry.walls),
      wallRangesByLineAndSide: buildWallRangesByLineAndSide(
        geometry.walls.map((wall) => ({
          lineIndex: wall.lineIndex ?? -1,
          sideDefIndex: wall.sideDefIndex ?? -1,
        })),
        map.LINEDEFS.length,
        map
      ),
    } as never;
  }

  function drawAt(x: number, y: number, yaw: number) {
    return buildGzdoomDrawState({
      map,
      buffers: {
        bspRenderIndex: bspIndex,
        sectorTriangles: {},
        triangleHash: null,
        sectorVisibility: index,
        wallRangesByLine: [],
        flats: [],
        subsectorFlats,
      } as never,
      viewX: x,
      viewY: y,
      viewYaw: yaw,
      cameraPos: [x, 41, -y],
    })!;
  }

  it('window room 43 facing south draws courtyard sky and window room, not hangar or distant indoor', () => {
    const state = drawAt(-192, -3128, Math.PI);
    expect(state.flatDrawMode).toBe('subsector-bsp');
    expect(state.cameraSectorIndex).toBe(43);
    expect(state.visibleSectors.has(42)).toBe(true);
    expect(state.visibleSectors.has(43)).toBe(true);
    expect(state.visibleSectors.has(0)).toBe(false);
    expect(state.visibleSectors.has(70)).toBe(false);
  });

  it('courtyard center facing north/east never draws hangar sky or sector 70', () => {
    const analysis = discoverCourtyardIslands(map, 'E1M1')!;
    const ctx = createCourtyardProbeContext(map, analysis)!;

    for (const viewYaw of [Math.PI / 2, Math.PI] as const) {
      const snapshot = probeCourtyardVisibility(
        ctx,
        {
          mapName: 'E1M1',
          label: 'courtyard-center',
          x: -2624,
          y: -2848,
          cameraSector: 42,
          islandId: analysis.islands.find((i) => i.skySectors.includes(42))!.islandId,
        },
        viewYaw
      )!;
      expect(snapshot.drawVisible.has(0)).toBe(false);
      expect(snapshot.drawVisible.has(70)).toBe(false);
    }
  });

  it('spawn facing courtyard windows includes courtyard sky sector 42 (production BSP)', () => {
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;
    const state = drawAt(
      playerStart.x,
      playerStart.y,
      (playerStart.angle * Math.PI) / 180
    );
    expect(state.flatDrawMode).toBe('subsector-bsp');
    expect(state.visibleSectors.has(42)).toBe(true);
    expect(state.visibleSectors.has(41)).toBe(false);
    expect(state.visibleSectors.has(70)).toBe(false);
    expect(state.visibleSectors.has(state.cameraSectorIndex)).toBe(true);
  });

  it('staircase sector 3 facing courtyard includes sky sector 42 (production BSP)', () => {
    const index = buildBspRenderIndex(map)!;
    const sv = buildSectorVisibilityIndex(map)!;
    const bounds = sv.sectorBounds[3]!;
    const bounds42 = sv.sectorBounds[42]!;
    const x = (bounds.minX + bounds.maxX) / 2;
    const y = (bounds.minY + bounds.maxY) / 2;
    const yaw = Math.atan2(
      (bounds42.minY + bounds42.maxY) / 2 - y,
      (bounds42.minX + bounds42.maxX) / 2 - x
    );
    const state = drawAt(x, y, yaw);
    expect(state.cameraSectorIndex).toBe(3);
    expect(state.visibleSectors.has(42)).toBe(true);
    expect(state.flatSubsectorOrder.length).toBeGreaterThan(0);
    const flatSectors = new Set<number>();
    for (const sub of state.flatSubsectorOrder) {
      const sec = index.subsectorToSector[sub] ?? -1;
      if (sec >= 0) flatSectors.add(sec);
    }
    expect(flatSectors.has(42)).toBe(true);
  });

  it('staircase sector 3 wireframe production includes courtyard flats; portal debug does not', () => {
    const geometryBuffers = buildCourtyardWireframeBuffers();
    const sv = buildSectorVisibilityIndex(map)!;
    const bounds = sv.sectorBounds[3]!;
    const bounds42 = sv.sectorBounds[42]!;
    const x = (bounds.minX + bounds.maxX) / 2;
    const y = (bounds.minY + bounds.maxY) / 2;
    const yaw = Math.atan2(
      (bounds42.minY + bounds42.maxY) / 2 - y,
      (bounds42.minX + bounds42.maxX) / 2 - x
    );
    const state = buildGzdoomDrawState({
      map,
      buffers: geometryBuffers,
      viewX: x,
      viewY: y,
      viewYaw: yaw,
      cameraPos: [x, 41, -y],
    })!;

    const productionFlatSectors = new Set(
      state.bspFlatSubsectorOrder.map((sub) => bspIndex.subsectorToSector[sub] ?? -1)
    );
    const portalFlatSectors = new Set(
      state.portalFlatSubsectorOrder.map((sub) => bspIndex.subsectorToSector[sub] ?? -1)
    );

    expect(state.cameraSectorIndex).toBe(3);
    expect(productionFlatSectors.has(42)).toBe(true);
    expect(portalFlatSectors.has(42)).toBe(false);

    const productionWire = countGzdoomMeshWireframeSegments(
      map,
      geometryBuffers,
      state,
      'boundary',
      'bsp'
    );
    const portalWire = countGzdoomMeshWireframeSegments(
      map,
      geometryBuffers,
      state,
      'boundary',
      'portal'
    );
    expect(productionWire.flatSegments).toBeGreaterThan(portalWire.flatSegments);
    expect(productionWire.wallSegments).toBeGreaterThan(0);
  });

});

runCourtyardSuite('public/wads/DOOM.WAD', 'DOOM');
runCourtyardSuite('public/wads/DOOM2.WAD', 'DOOM2');

describe('courtyard coverage stats', () => {
  it('summarizes probe counts for both IWADs', () => {
    const doom = discoverCourtyardsInWad(loadWad('public/wads/DOOM.WAD'));
    const doom2 = discoverCourtyardsInWad(loadWad('public/wads/DOOM2.WAD'));
    const doomProbes = doom.reduce((n, a) => n + a.probes.length, 0);
    const doom2Probes = doom2.reduce((n, a) => n + a.probes.length, 0);

    expect(doom.length).toBeGreaterThanOrEqual(25);
    expect(doom2.length).toBeGreaterThanOrEqual(20);
    expect(doomProbes).toBeGreaterThan(100);
    expect(doom2Probes).toBeGreaterThan(100);
  });
});
