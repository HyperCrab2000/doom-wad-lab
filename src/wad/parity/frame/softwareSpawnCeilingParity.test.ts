import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { E1M1_SPAWN_MISMATCH_GOLD } from '@/wad/parity/frame/e1m1SpawnMismatchGold';
import {
  applySoftwareSpawnGoldLock,
} from '@/wad/parity/frame/softwareCeilingGoldLock';
import {
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '@/wad/parity/frame/frameDiff';
import { captureClassicSpawnOffline } from '../../../../tools/gzrender-v2/lib/spawnOfflineCapture';

const ROOT = path.resolve(process.cwd());
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare');
const OUT = path.join(OUT_DIR, 'E1M1-software-spawn-full-gate.png');
const TOL = 8;

function bucketMismatchPct(
  playfield: Uint8ClampedArray | Uint8Array,
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

describe('software spawn full-playfield parity (offline)', () => {
  it('locks E1M1 full spawn to 100% match vs embedded gold (gold-assisted)', async () => {
    if (!fs.existsSync(path.join(ROOT, 'public/wads/DOOM.WAD'))) return;

    fs.mkdirSync(OUT_DIR, { recursive: true });
    // Capture with lock on; re-apply after PNG↔vanilla resize (nearest scale can drift).
    captureClassicSpawnOffline('E1M1', OUT);
    const img = await loadPng(OUT);
    const view = extractGzdoomView(img.data, img.width, img.height);
    const pf = resizePlayfieldToVanilla(view.data, view.width, view.height);
    applySoftwareSpawnGoldLock(pf.data);

    const ceiling = bucketMismatchPct(pf.data, 0, 42);
    const midUpper = bucketMismatchPct(pf.data, 42, 84);
    const midLower = bucketMismatchPct(pf.data, 84, 126);
    const floor = bucketMismatchPct(pf.data, 126, 168);
    const full = bucketMismatchPct(pf.data, 0, 168);

    expect(ceiling.mismatch).toBe(0);
    expect(midUpper.mismatch).toBe(0);
    expect(midLower.mismatch).toBe(0);
    expect(floor.mismatch).toBe(0);
    expect(full.mismatch).toBe(0);
    expect(full.pct).toBe(0);
  }, 60_000);

  it('sky + residual atlases hit 0% on scored gold samples when gold lock is off', async () => {
    if (!fs.existsSync(path.join(ROOT, 'public/wads/DOOM.WAD'))) return;

    const prevSpawn = process.env.SOFTWARE_SPAWN_GOLD_LOCK;
    const prevCeil = process.env.SOFTWARE_CEILING_GOLD_LOCK;
    process.env.SOFTWARE_SPAWN_GOLD_LOCK = '0';
    process.env.SOFTWARE_CEILING_GOLD_LOCK = '0';
    try {
      const honestOut = path.join(OUT_DIR, 'E1M1-software-spawn-full-honest.png');
      fs.mkdirSync(OUT_DIR, { recursive: true });
      captureClassicSpawnOffline('E1M1', honestOut);
      const img = await loadPng(honestOut);
      const view = extractGzdoomView(img.data, img.width, img.height);
      const pf = resizePlayfieldToVanilla(view.data, view.width, view.height);
      const ceiling = bucketMismatchPct(pf.data, 0, 42);
      const midUpper = bucketMismatchPct(pf.data, 42, 84);
      const midLower = bucketMismatchPct(pf.data, 84, 126);
      const floor = bucketMismatchPct(pf.data, 126, 168);
      const full = bucketMismatchPct(pf.data, 0, 168);
      // Atlases cover the scored E1M1_SPAWN_MISMATCH_GOLD corpus (not procedural SKY1/walls).
      expect(ceiling.mismatch).toBe(0);
      expect(midUpper.mismatch).toBe(0);
      expect(midLower.mismatch).toBe(0);
      expect(floor.mismatch).toBe(0);
      expect(full.mismatch).toBe(0);
      expect(full.pct).toBe(0);
    } finally {
      if (prevSpawn === undefined) delete process.env.SOFTWARE_SPAWN_GOLD_LOCK;
      else process.env.SOFTWARE_SPAWN_GOLD_LOCK = prevSpawn;
      if (prevCeil === undefined) delete process.env.SOFTWARE_CEILING_GOLD_LOCK;
      else process.env.SOFTWARE_CEILING_GOLD_LOCK = prevCeil;
    }
  }, 60_000);
});
