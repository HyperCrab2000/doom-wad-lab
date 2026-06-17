import { beforeAll, describe, expect, it } from 'vitest';

import { compareFrameSnapshots, formatStageSnapshotDiff } from '@/wad/renderer/modular/compareStageSnapshots';
import { hashFrameSnapshot } from '@/wad/renderer/modular/stageSnapshotCollector';
import { MODULAR_STAGE_ORDER } from '@/wad/renderer/modular/modularRenderStage';
import {
  captureAllSpawnModularFrameSnapshots,
  captureSpawnModularFrameSnapshot,
  iwadsPresent,
} from '@/wad/renderer/modular/spawnStageSnapshotHarness';
import { preloadAllIwadMaps } from '@/wad/renderer/bsp/vanilla/vanillaBspHarness';

describe('modular stage snapshot helpers', () => {
  it('hashFrameSnapshot is stable for identical stage maps', () => {
    const stages = {
      flats: {
        stage: 'flats' as const,
        backend: 'classic-gl' as const,
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
    const base = captureSpawnModularFrameSnapshot({ wadName: 'DOOM.WAD', mapName: 'E1M1' }, 'classic-gl');
    if (!base) return;
    const drift = structuredClone(base);
    const flats = drift.stages.flats!;
    flats.drawCounts.walls += 1;
    const result = compareFrameSnapshots(base, drift);
    expect(result.equal).toBe(false);
    expect(result.diffs.some((d) => d.field === 'drawCounts.walls')).toBe(true);
  });
});

describe('Classic GL vs WASM federated modular stage parity (68 maps @ spawn)', () => {
  beforeAll(() => {
    if (!iwadsPresent()) return;
    preloadAllIwadMaps();
  });

  it('covers 68 IWAD maps when WADs are present', () => {
    if (!iwadsPresent()) return;
    const classic = captureAllSpawnModularFrameSnapshots('classic-gl');
    expect(classic.length).toBe(68);
  });

  it('full renderer state hash matches between Classic GL and WASM at every map spawn', () => {
    if (!iwadsPresent()) return;

    const violations: string[] = [];
    for (const { mapRef, snapshot: classic } of captureAllSpawnModularFrameSnapshots('classic-gl')) {
      const wasm = captureSpawnModularFrameSnapshot(mapRef, 'wasm-federated');
      if (!wasm) {
        violations.push(`${mapRef.wadName}/${mapRef.mapName}: WASM snapshot missing`);
        continue;
      }
      const result = compareFrameSnapshots(classic, wasm, MODULAR_STAGE_ORDER);
      if (!result.equal) {
        violations.push(
          `${mapRef.wadName}/${mapRef.mapName}:\n${formatStageSnapshotDiff(result)}`,
        );
      }
    }

    expect(violations, violations.slice(0, 8).join('\n---\n')).toEqual([]);
  }, 120_000);

  for (const stage of MODULAR_STAGE_ORDER) {
    it(`per-stage BSP hash parity @ spawn — ${stage}`, () => {
      if (!iwadsPresent()) return;

      const violations: string[] = [];
      for (const { mapRef, snapshot: classic } of captureAllSpawnModularFrameSnapshots('classic-gl')) {
        const wasm = captureSpawnModularFrameSnapshot(mapRef, 'wasm-federated');
        if (!wasm) continue;
        const result = compareFrameSnapshots(classic, wasm, [stage]);
        if (!result.equal) {
          violations.push(`${mapRef.wadName}/${mapRef.mapName}: ${formatStageSnapshotDiff(result)}`);
        }
      }

      expect(violations, violations.slice(0, 5).join('\n')).toEqual([]);
    });
  }
});
