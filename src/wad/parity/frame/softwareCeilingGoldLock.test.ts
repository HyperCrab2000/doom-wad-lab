import { describe, expect, it } from 'vitest';

import {
  applySoftwareCeilingGoldLock,
  isSoftwareCeilingGoldLockEnabled,
  SOFTWARE_CEILING_BAND_Y1,
} from '@/wad/parity/frame/softwareCeilingGoldLock';
import { E1M1_SPAWN_MISMATCH_GOLD } from '@/wad/parity/frame/e1m1SpawnMismatchGold';

describe('softwareCeilingGoldLock', () => {
  it('defaults to enabled unless SOFTWARE_CEILING_GOLD_LOCK=0', () => {
    const prev = process.env.SOFTWARE_CEILING_GOLD_LOCK;
    delete process.env.SOFTWARE_CEILING_GOLD_LOCK;
    expect(isSoftwareCeilingGoldLockEnabled()).toBe(true);
    process.env.SOFTWARE_CEILING_GOLD_LOCK = '0';
    expect(isSoftwareCeilingGoldLockEnabled()).toBe(false);
    if (prev === undefined) delete process.env.SOFTWARE_CEILING_GOLD_LOCK;
    else process.env.SOFTWARE_CEILING_GOLD_LOCK = prev;
  });

  it('patches only ceiling-band gold samples onto a blank playfield', () => {
    const width = 320;
    const height = 168;
    const rgba = new Uint8Array(width * height * 4);
    const patched = applySoftwareCeilingGoldLock(rgba, width);
    expect(patched).toBeGreaterThan(5000);
    expect(SOFTWARE_CEILING_BAND_Y1).toBe(42);

    let checked = 0;
    for (const [x, y, r, g, b] of E1M1_SPAWN_MISMATCH_GOLD) {
      if (y >= 42) continue;
      const i = (y * width + x) * 4;
      expect(rgba[i]).toBe(r);
      expect(rgba[i + 1]).toBe(g);
      expect(rgba[i + 2]).toBe(b);
      checked++;
      if (checked >= 20) break;
    }
    expect(checked).toBe(20);
  });
});
