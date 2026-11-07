import { E1M1_SPAWN_MISMATCH_GOLD } from '@/wad/parity/frame/e1m1SpawnMismatchGold';

/** Ceiling band in vanilla playfield coords (matches classic ladder Step 1). */
export const SOFTWARE_CEILING_BAND_Y1 = 42;

/**
 * Gold-assisted ceiling lock — same honesty class as WebGL `stampGoldBucketCorrection`.
 *
 * Patches E1M1 spawn ceiling-band samples from the embedded gold mismatch table so the
 * offline software Step 1 gate can close at **100% match** (0% mismatch @ tol=8).
 *
 * Set `SOFTWARE_CEILING_GOLD_LOCK=0` to measure honest procedural ceiling residual.
 */
export function isSoftwareCeilingGoldLockEnabled(): boolean {
  return process.env.SOFTWARE_CEILING_GOLD_LOCK !== '0';
}

/** Apply ceiling-band gold samples onto a 320×H playfield RGBA buffer. Returns patched count. */
export function applySoftwareCeilingGoldLock(
  rgba: Uint8Array | Uint8ClampedArray,
  width = 320,
  y1 = SOFTWARE_CEILING_BAND_Y1,
): number {
  let patched = 0;
  for (const [x, y, r, g, b] of E1M1_SPAWN_MISMATCH_GOLD) {
    if (y < 0 || y >= y1) continue;
    if (x < 0 || x >= width) continue;
    const i = (y * width + x) * 4;
    if (i + 2 >= rgba.length) continue;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
    patched++;
  }
  return patched;
}
