import { beforeAll, describe, expect, it } from 'vitest';

import { batchItems, parallelMap } from '../../../../../test/parallelMap';
import {
  buildVanillaBspView,
  enumerateSectorProbes,
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
/** Keep each Vitest case under ~45s so worker RPC stays responsive. */
const MAP_BATCH_SIZE = 4;

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
    if (mapRefs.length === 0) return;
    expect(mapRefs.length).toBe(68);
  });

  for (const [batchIndex, batch] of batchItems(mapRefs, MAP_BATCH_SIZE).entries()) {
    it.concurrent(
      `classic trace matches buildBspVisibleSet at sector probes — batch ${batchIndex + 1}`,
      async () => {
        const perMap = await parallelMap(batch, (mapRef) => {
          const violations: VanillaBspViolation[] = [];
          const probes = enumerateSectorProbes(mapRef);

          for (const probe of probes) {
            for (const viewYaw of CARDINAL_YAWS) {
              const view = buildVanillaBspView(probe, probe.viewX, probe.viewY, viewYaw);
              const ctx = `${probe.wadName}/${probe.mapName} sector ${probe.sectorIndex} yaw ${((viewYaw * 180) / Math.PI).toFixed(0)}`;
              const visible = runVanillaBspVisible(view);
              const trace = runClassicBspTrace(view);
              violations.push(...checkTraceMatchesVisibleSet(ctx, visible, trace));
            }
          }

          return violations;
        });

        const violations = perMap.flat();
        expect(violations, formatViolations(violations)).toEqual([]);
      },
      120_000,
    );
  }

  it.concurrent('classic trace sector probe count exceeds 5000 across IWAD', () => {
    const probeCount = mapRefs.reduce(
      (sum, mapRef) => sum + enumerateSectorProbes(mapRef).length,
      0,
    );
    expect(probeCount).toBeGreaterThan(5000);
  });

  it('production subsector draw matches GZDoom BSP flat visits at every map player start', async () => {
    const perMap = await parallelMap(mapRefs, (mapRef) => {
      const violations: VanillaBspViolation[] = [];
      const start = playerStartView(loadWadMap(mapRef.wadName, mapRef.mapName));
      const view = buildVanillaBspView(mapRef, start.viewX, start.viewY, start.viewYaw);

      const ctx = `${mapRef.wadName}/${mapRef.mapName} spawn`;
      const visible = runVanillaBspVisible(view);
      const drawState = runProductionMeshDrawState(view);
      if (!drawState) return violations;

      if (drawState.flatDrawMode !== 'subsector-bsp') {
        violations.push({
          rule: 'flat-draw-mode',
          context: ctx,
          detail: `expected subsector-bsp, got ${drawState.flatDrawMode}`,
        });
        return violations;
      }

      violations.push(...checkGzdoomSubsectorFlatDraw(ctx, view.index, visible, drawState));
      violations.push(...checkDrawStateVsVanillaBsp(ctx, visible, drawState));
      return violations;
    });

    const violations = perMap.flat();
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it('classic trace matches buildBspVisibleSet at every map player start', async () => {
    const perMap = await parallelMap(mapRefs, (mapRef) => {
      const violations: VanillaBspViolation[] = [];
      const start = playerStartView(loadWadMap(mapRef.wadName, mapRef.mapName));
      const view = buildVanillaBspView(mapRef, start.viewX, start.viewY, start.viewYaw);

      const ctx = `${mapRef.wadName}/${mapRef.mapName} spawn`;
      const visible = runVanillaBspVisible(view);
      const trace = runClassicBspTrace(view);
      violations.push(...checkTraceMatchesVisibleSet(ctx, visible, trace));
      violations.push(...checkVanillaBspStructure(ctx, view.map, view.index, visible));
      return violations;
    });

    const violations = perMap.flat();
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it('mesh draw state stays inside vanilla BSP at every map player start', async () => {
    const perMap = await parallelMap(mapRefs, (mapRef) => {
      const violations: VanillaBspViolation[] = [];
      const start = playerStartView(loadWadMap(mapRef.wadName, mapRef.mapName));
      const view = buildVanillaBspView(mapRef, start.viewX, start.viewY, start.viewYaw);

      const ctx = `${mapRef.wadName}/${mapRef.mapName} spawn`;
      const visible = runVanillaBspVisible(view);
      const drawState = runMeshDrawState(view);
      if (!drawState) return violations;

      violations.push(...checkDrawStateVsVanillaBsp(ctx, visible, drawState));
      violations.push(...checkWireframeUsesVanillaBsp(ctx, drawState));
      return violations;
    });

    const violations = perMap.flat();
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it('mesh draw removes portal-filtered subsectors across the IWAD corpus', async () => {
    const perMap = await parallelMap(mapRefs, (mapRef) => {
      const start = playerStartView(loadWadMap(mapRef.wadName, mapRef.mapName));
      const view = buildVanillaBspView(mapRef, start.viewX, start.viewY, start.viewYaw);
      const visible = runVanillaBspVisible(view);
      const drawState = runMeshDrawState(view);
      if (!drawState) return 0;
      return countPortalFilteredSubsectors(visible, drawState);
    });

    const totalPortalRemoved = perMap.reduce((sum, n) => sum + n, 0);
    expect(totalPortalRemoved).toBeGreaterThan(0);
  });

  for (const [batchIndex, batch] of batchItems(mapRefs, MAP_BATCH_SIZE).entries()) {
    it.concurrent(
      `every sector satisfies vanilla BSP + wireframe invariants — batch ${batchIndex + 1}`,
      async () => {
        const perMap = await parallelMap(batch, (mapRef) => {
          const violations: VanillaBspViolation[] = [];
          const probes = enumerateSectorProbes(mapRef);

          for (const probe of probes) {
            const view = buildVanillaBspView(
              probe,
              probe.viewX,
              probe.viewY,
              CARDINAL_YAWS[probe.sectorIndex % CARDINAL_YAWS.length]!,
            );

            const ctx = `${probe.wadName}/${probe.mapName} sector ${probe.sectorIndex}`;
            const visible = runVanillaBspVisible(view);
            violations.push(...checkVanillaBspStructure(ctx, view.map, view.index, visible));

            const drawState = runMeshDrawState(view);
            if (drawState) {
              violations.push(...checkWireframeUsesVanillaBsp(ctx, drawState));
            }
          }

          return violations;
        });

        const violations = perMap.flat();
        expect(violations, formatViolations(violations)).toEqual([]);
      },
      90_000,
    );
  }
});
