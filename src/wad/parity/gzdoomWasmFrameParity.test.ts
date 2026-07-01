/**
 * Step 2 gate — browser GZDoom WASM frame ≡ gold-standard ref.png.
 *
 * Requires: npm run build:gzdoom-wasm, npm run dev (5150), IWAD in public/wads/.
 *
 * Set GZDOOM_WASM_FRAME_REQUIRED=1 to hard-fail on mismatch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { diffPlayfieldPngFiles, formatFrameDiff } from '@/wad/parity/frame/frameDiff';

const REQUIRED = process.env.GZDOOM_WASM_FRAME_REQUIRED === '1';
const ROOT = process.cwd();
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const WASM_OUT = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm');
const CAPTURE = path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-wasm-frame.mts');
const DEV_URL = process.env.TEST_URL ?? 'http://localhost:5150';

async function devServerUp(): Promise<boolean> {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe('Step 2 — GZDoom WASM frame parity', () => {
  const maps = ['E1M2', 'E1M4', 'E3M4', 'E3M6'] as const;

  for (const map of maps) {
    it(`${map} WASM frame matches gold-standard ref.png`, async () => {
      const slug = map.startsWith('MAP') ? 'DOOM2' : 'DOOM';
      const refPng = path.join(GOLD, slug, map, 'ref.png');
      const wasmPng = path.join(WASM_OUT, `${map}.png`);

      const iwad = path.join(ROOT, 'public/wads', `${slug}.WAD`);

      if (!fs.existsSync(iwad)) {
        if (REQUIRED) throw new Error(`Missing IWAD: ${iwad}`);
        return;
      }
      if (!fs.existsSync(refPng)) {
        if (REQUIRED) throw new Error(`Missing gold standard: ${refPng}`);
        return;
      }

      if (!(await devServerUp())) {
        if (REQUIRED) {
          throw new Error(`Dev server not reachable at ${DEV_URL} — run: npm run dev`);
        }
        return;
      }

      fs.mkdirSync(WASM_OUT, { recursive: true });
      execSync(`npx tsx "${CAPTURE}" ${map} "${wasmPng}"`, {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, TEST_URL: DEV_URL },
      });

      if (!fs.existsSync(wasmPng)) {
        if (REQUIRED) throw new Error(`Missing WASM capture: ${wasmPng}`);
        return;
      }

      const result = await diffPlayfieldPngFiles(refPng, wasmPng, { tolerance: 0 });
      // eslint-disable-next-line no-console
      console.log(`${map} WASM frame parity: ${formatFrameDiff(result)}`);

      if (REQUIRED) {
        expect(result.identical, formatFrameDiff(result)).toBe(true);
        expect(result.mismatchRatio).toBe(0);
      } else {
        expect(result.comparedPixels).toBeGreaterThan(0);
      }
    });
  }
});
