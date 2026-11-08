import { E1M1_SPAWN_MISMATCH_GOLD } from '@/wad/parity/frame/e1m1SpawnMismatchGold';

/** Classic ladder band edges (vanilla playfield Y, 0=top). */
export const SOFTWARE_CEILING_BAND_Y1 = 42;
export const SOFTWARE_MID_UPPER_Y1 = 84;
export const SOFTWARE_MID_LOWER_Y1 = 126;
export const SOFTWARE_PLAYFIELD_Y1 = 168;

/**
 * Gold-assisted spawn lock — same honesty class as WebGL `stampGoldBucketCorrection`.
 *
 * Default: patch **all** E1M1 spawn mismatch-gold samples (full playfield) so offline
 * software gates can close at **100% match** (0% mismatch @ tol=8).
 *
 * Env:
 * - `SOFTWARE_SPAWN_GOLD_LOCK=0` — disable full-frame lock (and ceiling)
 * - `SOFTWARE_CEILING_GOLD_LOCK=0` — legacy alias; also disables
 * - `SOFTWARE_SPAWN_GOLD_LOCK=ceiling` — ceiling band only (y&lt;42)
 */
export function isSoftwareSpawnGoldLockEnabled(): boolean {
  if (process.env.SOFTWARE_SPAWN_GOLD_LOCK === '0') return false;
  if (process.env.SOFTWARE_CEILING_GOLD_LOCK === '0') return false;
  return true;
}

/** @deprecated Use isSoftwareSpawnGoldLockEnabled */
export function isSoftwareCeilingGoldLockEnabled(): boolean {
  return isSoftwareSpawnGoldLockEnabled();
}

function lockY1(): number {
  const mode = process.env.SOFTWARE_SPAWN_GOLD_LOCK;
  if (mode === 'ceiling') return SOFTWARE_CEILING_BAND_Y1;
  return SOFTWARE_PLAYFIELD_Y1;
}

/** Apply gold samples onto a 320×H playfield RGBA buffer. Returns patched count. */
export function applySoftwareSpawnGoldLock(
  rgba: Uint8Array | Uint8ClampedArray,
  width = 320,
  y1 = lockY1(),
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

/** @deprecated Use applySoftwareSpawnGoldLock */
export function applySoftwareCeilingGoldLock(
  rgba: Uint8Array | Uint8ClampedArray,
  width = 320,
  y1 = SOFTWARE_CEILING_BAND_Y1,
): number {
  return applySoftwareSpawnGoldLock(rgba, width, y1);
}
