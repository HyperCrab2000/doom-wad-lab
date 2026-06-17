import { beforeAll, describe, expect, it } from 'vitest';

import {
  allSectorProbes,
  buildVanillaBspView,
  listIwadMaps,
  loadWadMap,
  playerStartView,
  preloadAllIwadMaps,
  runClassicBspTrace,
  runMeshDrawState,
  runProductionMeshDrawState,
  runVanillaBspVisible,
} from '@/wad/renderer/bsp/vanilla/vanillaBspHarness';
import {
  checkDrawStateVsVanillaBsp,
  checkGzdoomSubsectorFlatDraw,
  checkTraceMatchesVisibleSet,
  checkVanillaBspStructure,
  checkWireframeUsesVanillaBsp,
  countPortalFilteredSubsectors,
  type VanillaBspViolation,
} from '@/wad/renderer/bsp/vanilla/vanillaBspInvariants';

const CARDINAL_YAWS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

function formatViolations(violations: VanillaBspViolation[], limit = 15): string {
  return violations
    .slice(0, limit)
    .map((v) => `[${v.rule}] ${v.context}: ${v.detail}`)
    .join('\n');
}

describe('vanilla BSP parity (r_bsp.c / RenderBSP reference)', () => {
  beforeAll(() => {
    preloadAllIwadMaps();
  });

  const mapRefs = listIwadMaps();

  it(`covers ${mapRefs.length} maps across DOOM + DOOM2`, () => {
    expect(mapRefs.length).toBe(68);
  });

  it('classic trace matches buildBspVisibleSet at every sector probe and cardinal yaw', () => {
    const violations: VanillaBspViolation[] = [];
    const probes = allSectorProbes();

    for (const probe of probes) {
      for (const viewYaw of CARDINAL_YAWS) {
        const view = buildVanillaBspView(probe, probe.viewX, probe.viewY, viewYaw);
        const ctx = `${probe.wadName}/${probe.mapName} sector ${probe.sectorIndex} yaw ${((viewYaw * 180) / Math.PI).toFixed(0)}`;
        const visible = runVanillaBspVisible(view);
        const trace = runClassicBspTrace(view);
        violations.push(...checkTraceMatchesVisibleSet(ctx, visible, trace));
      }
    }

    expect(probes.length).toBeGreaterThan(5000);
    expect(violations, formatViolations(violations)).toEqual([]);
  }, 300_000);

  it('production subsector draw matches GZDoom BSP flat visits at every map player start', () => {
    const violations: VanillaBspViolation[] = [];

    for (const mapRef of mapRefs) {
      const start = playerStartView(loadWadMap(mapRef.wadName, mapRef.mapName));
      const view = buildVanillaBspView(mapRef, start.viewX, start.viewY, start.viewYaw);

      const ctx = `${mapRef.wadName}/${mapRef.mapName} spawn`;
      const visible = runVanillaBspVisible(view);
      const drawState = runProductionMeshDrawState(view);
      if (!drawState) continue;

      expect(drawState.flatDrawMode).toBe('subsector-bsp');
      violations.push(...checkGzdoomSubsectorFlatDraw(ctx, view.index, visible, drawState));
      violations.push(...checkDrawStateVsVanillaBsp(ctx, visible, drawState));
    }

    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it('classic trace matches buildBspVisibleSet at every map player start', () => {
    const violations: VanillaBspViolation[] = [];

    for (const mapRef of mapRefs) {
      const start = playerStartView(loadWadMap(mapRef.wadName, mapRef.mapName));
      const view = buildVanillaBspView(mapRef, start.viewX, start.viewY, start.viewYaw);

      const ctx = `${mapRef.wadName}/${mapRef.mapName} spawn`;
      const visible = runVanillaBspVisible(view);
      const trace = runClassicBspTrace(view);
      violations.push(...checkTraceMatchesVisibleSet(ctx, visible, trace));
      violations.push(...checkVanillaBspStructure(ctx, view.map, view.index, visible));
    }

    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it('mesh draw state stays inside vanilla BSP at every map player start', () => {
    const violations: VanillaBspViolation[] = [];
    let totalPortalRemoved = 0;

    for (const mapRef of mapRefs) {
      const start = playerStartView(loadWadMap(mapRef.wadName, mapRef.mapName));
      const view = buildVanillaBspView(mapRef, start.viewX, start.viewY, start.viewYaw);

      const ctx = `${mapRef.wadName}/${mapRef.mapName} spawn`;
      const visible = runVanillaBspVisible(view);
      const drawState = runMeshDrawState(view);
      if (!drawState) continue;

      violations.push(...checkDrawStateVsVanillaBsp(ctx, visible, drawState));
      violations.push(...checkWireframeUsesVanillaBsp(ctx, drawState));
      totalPortalRemoved += countPortalFilteredSubsectors(visible, drawState);
    }

    expect(violations, formatViolations(violations)).toEqual([]);
    expect(totalPortalRemoved).toBeGreaterThan(0);
  });

  it('every sector in every IWAD map satisfies vanilla BSP + wireframe draw invariants', () => {
    const violations: VanillaBspViolation[] = [];
    const probes = allSectorProbes();

    for (const probe of probes) {
      const view = buildVanillaBspView(
        probe,
        probe.viewX,
        probe.viewY,
        CARDINAL_YAWS[probe.sectorIndex % CARDINAL_YAWS.length]!
      );

      const ctx = `${probe.wadName}/${probe.mapName} sector ${probe.sectorIndex}`;
      const visible = runVanillaBspVisible(view);
      violations.push(...checkVanillaBspStructure(ctx, view.map, view.index, visible));

      const drawState = runMeshDrawState(view);
      if (drawState) {
        violations.push(...checkWireframeUsesVanillaBsp(ctx, drawState));
      }
    }

    expect(probes.length).toBeGreaterThan(5000);
    expect(violations, formatViolations(violations)).toEqual([]);
  }, 120_000);
});
