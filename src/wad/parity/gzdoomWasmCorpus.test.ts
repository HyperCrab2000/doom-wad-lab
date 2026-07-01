/**
 * Step 2c gate — GZDoom WASM frame corpus (68 maps, tiered oracle).
 *
 * Requires: npm run build:gzdoom-wasm, npm run dev (5150)
 *
 * Set GZDOOM_WASM_CORPUS_REQUIRED=1 to hard-fail.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REQUIRED = process.env.GZDOOM_WASM_CORPUS_REQUIRED === '1';
const ROOT = process.cwd();
const REPORT = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm-corpus-report.json');
const DEV_URL = process.env.TEST_URL ?? 'http://localhost:5150';

async function devServerUp(): Promise<boolean> {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

function runCorpus(iwad: string, maps: string): void {
  execSync(
    `npx tsx tools/gzrender-v2/gzdoom-wasm-corpus.mts "${iwad}" --gate bandaid --maps ${maps}`,
    { cwd: ROOT, stdio: 'inherit', env: { ...process.env, TEST_URL: DEV_URL } },
  );
}

describe('Step 2c — GZDoom WASM frame corpus (bandaid gate)', () => {
  it('canary maps pass tiered gate (strict + edge + wasm-gold)', async () => {
    const iwad = path.join(ROOT, 'public/wads/DOOM.WAD');
    if (!fs.existsSync(iwad)) {
      if (REQUIRED) throw new Error(`Missing ${iwad}`);
      return;
    }
    if (!(await devServerUp())) {
      if (REQUIRED) throw new Error(`Dev server not reachable at ${DEV_URL}`);
      return;
    }

    // E1M2 strict · E1M1 edge · E1M6 wasm-gold outdoor
    runCorpus(iwad, 'E1M2,E1M1,E1M6');

    const report = JSON.parse(fs.readFileSync(REPORT, 'utf8')) as {
      DOOM?: { totals?: { fail?: number; pass?: number } };
    };
    const totals = report.DOOM?.totals;
    expect(totals?.fail ?? 1, 'canary corpus failures').toBe(0);
    expect(totals?.pass).toBe(3);
  });
});
