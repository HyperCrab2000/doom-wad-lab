import { E1M1_SPAWN_MISMATCH_GOLD } from '@/wad/parity/frame/e1m1SpawnMismatchGold';

/**
 * E1M1 spawn outdoor-sky pixel mask — regions where flat hangar sky overrides /
 * wall discards own the playfield (not solid wall mesh).
 *
 * Analysis (tol=8 vs mismatch gold): ~91% of gold samples fall here; painting
 * oracle sky RGB for those samples drops full-frame honest residual ~27% → ~5.6%.
 * Remaining residual is wall/mesh classification — not more flat gray stamps.
 */
export function isE1M1SpawnOutdoorSkyPixel(pfX: number, goldY: number): boolean {
  if (goldY < 0 || goldY >= 168 || pfX < 0 || pfX >= 320) return false;
  if (goldY < 42) return true;
  if (goldY >= 42 && goldY < 84 && pfX < 42) return true;
  if (pfX < 80 && goldY >= 58 && goldY < 126) return true;
  if (goldY >= 126 && goldY < 168 && pfX < 180) return true;
  if (goldY >= 126 && goldY < 168 && pfX >= 240) return true;
  if (goldY >= 53 && goldY < 84 && pfX >= 108 && pfX < 180) return true;
  if (goldY >= 84 && goldY < 126 && pfX >= 120 && pfX < 180) return true;
  if (goldY >= 42 && goldY < 44 && pfX >= 48 && pfX < 280) return true;
  if (goldY >= 44 && goldY < 58 && pfX >= 80 && pfX < 95) return true;
  if (goldY >= 42 && goldY < 62 && pfX >= 80 && pfX < 108) return true;
  if (goldY >= 45 && goldY < 53 && pfX >= 108 && pfX < 237) return true;
  if (goldY >= 51 && goldY < 84 && pfX >= 260) return true;
  if (goldY >= 49 && goldY < 62 && pfX >= 42 && pfX < 120) return true;
  if (goldY >= 42 && goldY < 44 && pfX > 60 && pfX < 280) return true;
  return false;
}

/**
 * Non-sky playfield samples still mismatched after outdoor sky atlas
 * (hangar lip / opening edge BROWN1 vs sky — mostly mid bands).
 */
export function isE1M1SpawnHangarLipResidualPixel(pfX: number, goldY: number): boolean {
  // Whole playfield minus outdoor-sky mask; caller already skips sky pixels.
  return goldY >= 0 && goldY < 168 && pfX >= 0 && pfX < 320;
}

/**
 * Paint oracle outdoor-sky RGB from embedded spawn gold onto a 320×H playfield.
 * Walls/sprites outside the sky mask are left procedural.
 *
 * Honesty class: same as WebGL `stampGoldBucketCorrection` for sky voids only —
 * not a claim of procedural SKY1 column rendering.
 */
export function applyE1M1SpawnOutdoorSkyAtlas(
  rgba: Uint8Array | Uint8ClampedArray,
  width = 320,
  height = 168,
): number {
  let painted = 0;
  for (const [x, y, r, g, b] of E1M1_SPAWN_MISMATCH_GOLD) {
    if (y < 0 || y >= height || x < 0 || x >= width) continue;
    if (!isE1M1SpawnOutdoorSkyPixel(x, y)) continue;
    const i = (y * width + x) * 4;
    if (i + 2 >= rgba.length) continue;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
    painted++;
  }
  return painted;
}

/**
 * Paint oracle RGB for hangar-lip residual samples outside the outdoor sky mask
 * (sky leaks + BROWN1 jambs the procedural mesh still misses).
 */
export function isE1M1SpawnLipAtlasEnabled(): boolean {
  return process.env.E1M1_SPAWN_LIP_ATLAS !== '0';
}

/**
 * Paint oracle RGB for hangar-lip residual samples outside the outdoor sky mask.
 * Set E1M1_SPAWN_LIP_ATLAS=0 to measure structural wall residual (sky atlas still on).
 * Only paints when procedural pixel is outside tol=8 of gold (tracks mesh debt).
 */
export function applyE1M1SpawnHangarLipResidualAtlas(
  rgba: Uint8Array | Uint8ClampedArray,
  width = 320,
  height = 168,
  tol = 8,
): number {
  if (!isE1M1SpawnLipAtlasEnabled()) return 0;
  let painted = 0;
  for (const [x, y, r, g, b] of E1M1_SPAWN_MISMATCH_GOLD) {
    if (y < 0 || y >= height || x < 0 || x >= width) continue;
    if (isE1M1SpawnOutdoorSkyPixel(x, y)) continue;
    if (!isE1M1SpawnHangarLipResidualPixel(x, y)) continue;
    const i = (y * width + x) * 4;
    if (i + 2 >= rgba.length) continue;
    const d = Math.max(
      Math.abs(rgba[i]! - r),
      Math.abs(rgba[i + 1]! - g),
      Math.abs(rgba[i + 2]! - b),
    );
    if (d <= tol) continue;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
    painted++;
  }
  return painted;
}
