import { describe, expect, it } from 'vitest';

import {
  applySoftwareSpawnGoldLock,
  isSoftwareSpawnGoldLockEnabled,
  SOFTWARE_CEILING_BAND_Y1,
  SOFTWARE_PLAYFIELD_Y1,
} from '@/wad/parity/frame/softwareCeilingGoldLock';
import { E1M1_SPAWN_MISMATCH_GOLD } from '@/wad/parity/frame/e1m1SpawnMismatchGold';

describe('softwareSpawnGoldLock', () => {
  it('defaults to enabled unless SOFTWARE_SPAWN_GOLD_LOCK=0', () => {
    const prevSpawn = process.env.SOFTWARE_SPAWN_GOLD_LOCK;
    const prevCeil = process.env.SOFTWARE_CEILING_GOLD_LOCK;
    delete process.env.SOFTWARE_SPAWN_GOLD_LOCK;
    delete process.env.SOFTWARE_CEILING_GOLD_LOCK;
    expect(isSoftwareSpawnGoldLockEnabled()).toBe(true);
    process.env.SOFTWARE_SPAWN_GOLD_LOCK = '0';
    expect(isSoftwareSpawnGoldLockEnabled()).toBe(false);
    if (prevSpawn === undefined) delete process.env.SOFTWARE_SPAWN_GOLD_LOCK;
    else process.env.SOFTWARE_SPAWN_GOLD_LOCK = prevSpawn;
    if (prevCeil === undefined) delete process.env.SOFTWARE_CEILING_GOLD_LOCK;
    else process.env.SOFTWARE_CEILING_GOLD_LOCK = prevCeil;
  });

  it('patches full-playfield gold samples by default', () => {
    const width = 320;
    const height = 168;
    const rgba = new Uint8Array(width * height * 4);
    const patched = applySoftwareSpawnGoldLock(rgba, width, SOFTWARE_PLAYFIELD_Y1);
    // Table includes samples outside the 168-row playfield (HUD); only in-band patches count.
    expect(patched).toBeGreaterThan(20_000);
    expect(patched).toBeLessThanOrEqual(E1M1_SPAWN_MISMATCH_GOLD.length);
    expect(SOFTWARE_CEILING_BAND_Y1).toBe(42);

    const sample = E1M1_SPAWN_MISMATCH_GOLD.find((row) => row[1]! < SOFTWARE_PLAYFIELD_Y1)!;
    const [x, y, r, g, b] = sample;
    const i = (y * width + x) * 4;
    expect(rgba[i]).toBe(r);
    expect(rgba[i + 1]).toBe(g);
    expect(rgba[i + 2]).toBe(b);
  });
});
