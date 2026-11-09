import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildStructuralViewSnapshot,
  hashStructuralViewSnapshot,
  structuralCoreEqual,
  type StructuralViewSnapshot,
} from '@/wad/parity/structural/structuralViewSnapshot';
import {
  checkStructuralViewSnapshot,
  formatStructuralViolations,
  type StructuralViolation,
} from '@/wad/parity/structural/structuralVisibilityInvariants';
import { findCameraSubsector } from '@/wad/renderer/bsp/bspRenderIndex';
import {
  buildVanillaBspView,
  enumerateSectorProbes,
  loadCachedMap,
  playerStartView,
  runProductionMeshDrawState,
  runVanillaBspVisible,
} from '@/wad/renderer/bsp/vanilla/vanillaBspHarness';

const HAS_STOCK_IWAD = fs.existsSync(path.join(process.cwd(), 'public/wads/DOOM.WAD'));
const E1M1 = { wadName: 'DOOM.WAD', mapName: 'E1M1' } as const;

/** Classic Doom BSP is pitch-invariant; sample look-up / level / look-down. */
const PITCHES = [-0.55, 0, 0.55] as const;
const CARDINAL_YAWS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const;

/**
 * Frozen structural cores for E1M1 (sectors + walls + things).
 * Regenerate: log `hashStructuralViewSnapshot(captureSnapshot(...))` and paste.
 */
const E1M1_GOLDEN: Record<string, { viewX: number; viewY: number; yawDeg: number; hash: string }> =
  {
    spawn: { viewX: 1056, viewY: -3616, yawDeg: 90, hash: 'adf1f1434169c74d' },
    'window43-south': { viewX: -192, viewY: -3128, yawDeg: 180, hash: 'b8f541ac51003472' },
    'courtyard-center-n': { viewX: -2624, viewY: -2848, yawDeg: 180, hash: 'bd5bcc5dec55d344' },
  };

function captureSnapshot(
  viewX: number,
  viewY: number,
  viewYaw: number,
  _viewPitch: number
): StructuralViewSnapshot {
  const { map, index } = loadCachedMap(E1M1.wadName, E1M1.mapName);
  const view = buildVanillaBspView(E1M1, viewX, viewY, viewYaw);
  const bspVisible = runVanillaBspVisible(view);
  const drawState = runProductionMeshDrawState(view);
  // Pitch is intentionally unused: structural sets must ignore it.
  void _viewPitch;
  return buildStructuralViewSnapshot(map, index, bspVisible, drawState);
}

describe.skipIf(!HAS_STOCK_IWAD)('structural visibility parity (declarative, no pixels)', () => {
  beforeAll(() => {
    loadCachedMap(E1M1.wadName, E1M1.mapName);
  });

  it('E1M1 spawn: pitch look-up/down yields identical sector/wall/thing sets', () => {
    const { map } = loadCachedMap(E1M1.wadName, E1M1.mapName);
    const start = playerStartView(map);
    const baselines = PITCHES.map((pitch) =>
      captureSnapshot(start.viewX, start.viewY, start.viewYaw, pitch)
    );

    for (let i = 1; i < baselines.length; i++) {
      expect(
        structuralCoreEqual(baselines[0]!, baselines[i]!),
        `pitch ${PITCHES[i]} diverged from pitch ${PITCHES[0]}`
      ).toBe(true);
    }

    expect(baselines[0]!.bspVisibleSectors.length).toBeGreaterThan(0);
    expect(baselines[0]!.drawVisibleSectors.length).toBeGreaterThan(0);
    expect(baselines[0]!.visibleThingIndices.length).toBeGreaterThan(0);
  });

  it('E1M1 every walkable sector × cardinal yaw × pitch: invariants + pitch invariance', () => {
    const { map, index } = loadCachedMap(E1M1.wadName, E1M1.mapName);
    const probes = enumerateSectorProbes(E1M1);
    const violations: StructuralViolation[] = [];
    let pitchMismatches = 0;
    let samples = 0;

    for (const probe of probes) {
      for (const yaw of CARDINAL_YAWS) {
        const perPitch = PITCHES.map((pitch) =>
          captureSnapshot(probe.viewX, probe.viewY, yaw, pitch)
        );
        samples += perPitch.length;

        for (let i = 1; i < perPitch.length; i++) {
          if (!structuralCoreEqual(perPitch[0]!, perPitch[i]!)) {
            pitchMismatches++;
          }
        }

        const ctx = `E1M1 sector ${probe.sectorIndex} @ (${probe.viewX.toFixed(0)},${probe.viewY.toFixed(0)}) yaw=${((yaw * 180) / Math.PI).toFixed(0)}`;
        violations.push(...checkStructuralViewSnapshot(ctx, map, index, perPitch[0]!));
      }
    }

    expect(probes.length).toBeGreaterThan(50);
    expect(samples).toBe(probes.length * CARDINAL_YAWS.length * PITCHES.length);
    expect(pitchMismatches, `${pitchMismatches} pitch divergences`).toBe(0);
    expect(violations, formatStructuralViolations(violations)).toEqual([]);
  });

  it('E1M1 golden structural hashes lock spawn + courtyard thing/sector sets', () => {
    const { map } = loadCachedMap(E1M1.wadName, E1M1.mapName);
    const start = playerStartView(map);
    expect(start.viewX).toBe(E1M1_GOLDEN.spawn!.viewX);
    expect(start.viewY).toBe(E1M1_GOLDEN.spawn!.viewY);

    const liveHashes: Record<string, string> = {
      spawn: hashStructuralViewSnapshot(
        captureSnapshot(start.viewX, start.viewY, start.viewYaw, 0)
      ),
      'window43-south': hashStructuralViewSnapshot(
        captureSnapshot(-192, -3128, Math.PI, 0)
      ),
      'courtyard-center-n': hashStructuralViewSnapshot(
        captureSnapshot(-2624, -2848, Math.PI, 0)
      ),
    };

    for (const [key, expected] of Object.entries(E1M1_GOLDEN)) {
      expect(liveHashes[key], `${key} structural hash`).toBe(expected.hash);
    }

    const spawnSnap = captureSnapshot(start.viewX, start.viewY, start.viewYaw, 0);
    const hasPickupOrWeapon = spawnSnap.visibleThingTypes.some(
      (t) => (t >= 2001 && t <= 2049) || t === 2014 || t === 2011
    );
    expect(hasPickupOrWeapon).toBe(true);
  });

  it('things in other sectors appear only when that sector is draw-visible', () => {
    const { map, index } = loadCachedMap(E1M1.wadName, E1M1.mapName);
    const start = playerStartView(map);
    const snap = captureSnapshot(start.viewX, start.viewY, start.viewYaw, 0);
    const draw = new Set(snap.drawVisibleSectors);

    for (const thingIndex of snap.visibleThingIndices) {
      const thing = map.THINGS[thingIndex]!;
      const ss = findCameraSubsector(map, thing.x, thing.y);
      const sectorIndex = index.subsectorToSector[ss] ?? -1;
      expect(draw.has(sectorIndex), `thing ${thingIndex} sector ${sectorIndex}`).toBe(true);
    }

    let outside = 0;
    for (let i = 0; i < map.THINGS.length; i++) {
      if (snap.visibleThingIndices.includes(i)) continue;
      const thing = map.THINGS[i]!;
      if (thing.flags.hideInSingleplayer) continue;
      outside++;
    }
    expect(outside).toBeGreaterThan(0);
  });
});
