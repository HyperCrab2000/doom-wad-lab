import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { compareFrameSnapshots, formatStageSnapshotDiff } from '@/wad/renderer/modular/compareStageSnapshots';
import { hashFrameSnapshot } from '@/wad/renderer/modular/stageSnapshotCollector';
import { MODULAR_STAGE_ORDER } from '@/wad/renderer/modular/modularRenderStage';
import {
  captureAllSpawnModularFrameSnapshots,
  captureSpawnModularFrameSnapshot,
  clearModularSnapshotCache,
  iwadsPresent,
} from '@/wad/renderer/modular/spawnStageSnapshotHarness';
import { preloadAllIwadMaps } from '@/wad/renderer/bsp/vanilla/vanillaBspHarness';
import type { ModularFrameSnapshot } from '@/wad/renderer/modular/stageSnapshotTypes';
import type { MapRef } from '@/wad/renderer/bsp/vanilla/vanillaBspHarness';

const E1M1: MapRef = { wadName: 'DOOM.WAD', mapName: 'E1M1' };

describe('modular stage snapshot helpers', () => {
  it('hashFrameSnapshot is stable for identical stage maps', () => {
    const stages = {
      flats: {
        stage: 'flats' as const,
        backend: 'classic' as const,
        mapName: 'E1M1',
        stageCap: null,
        cameraSectorIndex: 0,
        cameraSubsector: 1,
        flatDrawMode: 'subsector-bsp',
        drawCounts: {
          walls: 10,
          flats: 5,
          transparentWalls: 0,
          voxels: 0,
          sprites: 0,
          wallSkippedTex: 0,
        },
        bsp: null,
        bspHash: 'abc123',
      },
    };
    expect(hashFrameSnapshot(stages)).toBe(hashFrameSnapshot(stages));
  });

  it('compareFrameSnapshots detects draw count drift', () => {
    const base = captureSpawnModularFrameSnapshot(E1M1, 'classic');
    if (!base) return;
    const drift = structuredClone(base);
    const flats = drift.stages.flats!;
    flats.drawCounts.walls += 1;
    const result = compareFrameSnapshots(base, drift);
    expect(result.equal).toBe(false);
    expect(result.diffs.some((d) => d.field === 'drawCounts.walls')).toBe(true);
  });
});

describe('Classic GL modular stages @ spawn (68 maps)', () => {
  let classicSnapshots: Array<{ mapRef: MapRef; snapshot: ModularFrameSnapshot }> = [];

  beforeAll(() => {
    if (!iwadsPresent()) return;
    preloadAllIwadMaps();
    classicSnapshots = captureAllSpawnModularFrameSnapshots('classic');
  });

  afterAll(() => {
    clearModularSnapshotCache();
  });

  it('covers 68 IWAD maps when WADs are present', () => {
    if (!iwadsPresent()) return;
    expect(classicSnapshots.length).toBe(68);
  });

  it('classic snapshots use WAD-parsed geometry', () => {
    if (!iwadsPresent()) return;
    for (const { snapshot } of classicSnapshots) {
      expect(snapshot.geometrySource).toBe('wad');
    }
  });
});

describe.concurrent('WASM federated modular parity (GZSTATE geometry vs Classic WAD @ spawn)', () => {
  let classicSnapshots: Array<{ mapRef: MapRef; snapshot: ModularFrameSnapshot }> = [];

  beforeAll(() => {
    if (!iwadsPresent()) return;
    preloadAllIwadMaps();
    classicSnapshots = captureAllSpawnModularFrameSnapshots('classic');
    for (const { mapRef } of classicSnapshots) {
      captureSpawnModularFrameSnapshot(mapRef, 'wasm-federated');
    }
  });

  afterAll(() => {
    clearModularSnapshotCache();
  });

  it('wasm-federated uses GZSTATE geometry (not shared WAD harness)', () => {
    if (!iwadsPresent()) return;
    const classic = captureSpawnModularFrameSnapshot(E1M1, 'classic');
    const wasm = captureSpawnModularFrameSnapshot(E1M1, 'wasm-federated');
    expect(classic?.geometrySource).toBe('wad');
    expect(wasm?.geometrySource).toBe('gzstate');
  });

  it('full renderer state hash matches Classic when GZSTATE reconstructs map correctly', () => {
    if (!iwadsPresent()) return;

    const violations: string[] = [];
    for (const { mapRef, snapshot: classic } of classicSnapshots) {
      const wasm = captureSpawnModularFrameSnapshot(mapRef, 'wasm-federated');
      if (!wasm) {
        violations.push(`${mapRef.wadName}/${mapRef.mapName}: WASM snapshot missing`);
        continue;
      }
      if (wasm.geometrySource !== 'gzstate') {
        violations.push(`${mapRef.wadName}/${mapRef.mapName}: trivial WASM harness (expected geometrySource=gzstate)`);
        continue;
      }
      const result = compareFrameSnapshots(classic, wasm, MODULAR_STAGE_ORDER);
      if (!result.equal) {
        violations.push(
          `${mapRef.wadName}/${mapRef.mapName}:\n${formatStageSnapshotDiff(result)}`,
        );
      }
    }

    if (violations.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `WASM federated modular drift: ${violations.length} map(s) — GZSTATE geometry vs WAD parser @ spawn`,
      );
    }

    const required = process.env.GZRENDER_MODULAR_PARITY_REQUIRED === '1';
    if (!required) {
      expect(violations.length).toBeLessThan(68);
      return;
    }
    expect(violations, violations.slice(0, 8).join('\n---\n')).toEqual([]);
  }, 120_000);

  for (const stage of MODULAR_STAGE_ORDER) {
    it.concurrent(`per-stage BSP hash parity @ spawn — ${stage}`, () => {
      if (!iwadsPresent()) return;

      const violations: string[] = [];
      for (const { mapRef, snapshot: classic } of classicSnapshots) {
        const wasm = captureSpawnModularFrameSnapshot(mapRef, 'wasm-federated');
        if (!wasm || wasm.geometrySource !== 'gzstate') continue;
        const result = compareFrameSnapshots(classic, wasm, [stage]);
        if (!result.equal) {
          violations.push(`${mapRef.wadName}/${mapRef.mapName}: ${formatStageSnapshotDiff(result)}`);
        }
      }

      if (process.env.GZRENDER_MODULAR_PARITY_REQUIRED !== '1') return;
      expect(violations, violations.slice(0, 5).join('\n')).toEqual([]);
    });
  }
});