import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { E1M1_SPAWN_MISMATCH_GOLD } from '@/wad/parity/frame/e1m1SpawnMismatchGold';
import {
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '@/wad/parity/frame/frameDiff';
import { captureClassicSpawnOffline } from '../../../../tools/gzrender-v2/lib/spawnOfflineCapture';

const ROOT = path.resolve(process.cwd());
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare');
const OUT = path.join(OUT_DIR, 'E1M1-software-spawn-ceiling-gate.png');
const TOL = 8;

function bucketMismatchPct(
  playfield: Uint8ClampedArray,
  y0: number,
  y1: number,
): { total: number; mismatch: number; pct: number } {
  let total = 0;
  let mismatch = 0;
  for (const [x, y, gr, gg, gb] of E1M1_SPAWN_MISMATCH_GOLD) {
    if (y < y0 || y >= y1) continue;
    total++;
    const i = (y * 320 + x) * 4;
    const d = Math.max(
      Math.abs(playfield[i]! - gr),
      Math.abs(playfield[i + 1]! - gg),
      Math.abs(playfield[i + 2]! - gb),
    );
    if (d > TOL) mismatch++;
  }
  return { total, mismatch, pct: total ? (mismatch / total) * 100 : 100 };
}

describe('software spawn ceiling parity (offline)', () => {
  it('cuts E1M1 ceiling-band mismatch vs embedded gold below 55%', async () => {
    if (!fs.existsSync(path.join(ROOT, 'public/wads/DOOM.WAD'))) return;

    fs.mkdirSync(OUT_DIR, { recursive: true });
    captureClassicSpawnOffline('E1M1', OUT);
    const img = await loadPng(OUT);
    const view = extractGzdoomView(img.data, img.width, img.height);
    const pf = resizePlayfieldToVanilla(view.data, view.width, view.height);

    const ceiling = bucketMismatchPct(pf.data, 0, 42);
    const midLower = bucketMismatchPct(pf.data, 84, 126);
    const full = bucketMismatchPct(pf.data, 0, 168);

    // Baseline before outdoor-sky discard + gold-Y shade fix: ceiling ~80.5%, full ~92.4%.
    expect(ceiling.pct).toBeLessThan(55);
    expect(midLower.pct).toBeLessThan(86);
    expect(full.pct).toBeLessThan(90);
  }, 60_000);
});
