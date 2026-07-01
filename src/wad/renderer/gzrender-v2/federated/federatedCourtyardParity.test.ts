import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import {
  checkDrawInvariants,
  type CourtyardInvariantViolation,
} from '@/wad/renderer/courtyard/courtyardInvariants';
import { discoverCourtyardsInWad } from '@/wad/renderer/courtyard/discoverCourtyards';
import {
  COURTYARD_PROBE_YAWS,
  createCourtyardProbeContext,
  probeCourtyardVisibility,
} from '@/wad/renderer/courtyard/probeCourtyardVisibility';
import { loadGzstateWadMap } from '@/wad/renderer/modular/spawnStageSnapshotHarness';

const DOOM_WAD = path.join(process.cwd(), 'public/wads/DOOM.WAD');

function formatViolations(violations: CourtyardInvariantViolation[]): string {
  return violations
    .slice(0, 12)
    .map((v) => `[${v.rule}] ${v.detail}`)
    .join('\n');
}

describe('WASM federated courtyard visibility (GZSTATE geometry)', () => {
  it('E1M1 courtyard probes pass BSP draw contract on gzstate-reconstructed map', () => {
    if (!fs.existsSync(DOOM_WAD)) return;

    const buf = fs.readFileSync(DOOM_WAD);
    const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const analyses = discoverCourtyardsInWad(wad).filter((a) => a.mapName === 'E1M1');
    expect(analyses.length).toBeGreaterThan(0);

    const gzstateMap = loadGzstateWadMap({ wadName: 'DOOM.WAD', mapName: 'E1M1' });
    const violations: CourtyardInvariantViolation[] = [];

    for (const analysis of analyses) {
      const ctx = createCourtyardProbeContext(gzstateMap, analysis);
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
              snapshot.flatDrawMode,
            ),
          );
        }
      }
    }

    expect(violations, formatViolations(violations)).toEqual([]);
  }, 60_000);
});
