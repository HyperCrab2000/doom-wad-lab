import { describe, expect, it } from 'vitest';
import puppeteer from 'puppeteer';
import { execSync } from 'node:child_process';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:4173';

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe('Diamond E2E suite', () => {
  it(
    'runs full acceptance pyramid against preview/dev server',
    async () => {
      if (!(await isServerUp())) {
        if (process.env.BROWSER_INTEGRATION_REQUIRED === '1') {
          expect(await isServerUp(), `Start server at ${BASE_URL}`).toBe(true);
        }
        return;
      }

      execSync('npx tsx tools/gzrender-v2/diamond-e2e-suite.mts', {
        cwd: process.cwd(),
        env: { ...process.env, TEST_URL: BASE_URL },
        stdio: 'inherit',
      });
    },
    600_000
  );
});
