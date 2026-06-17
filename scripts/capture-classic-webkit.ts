import { chromium } from '@playwright/test';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT = 'tmp-e1m1-verify/classic-webkit.png';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE_URL}/?renderer=classic`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('.level-toolbar select').first().selectOption('/wads/DOOM.WAD');
  await page.locator('select').nth(1).selectOption('E1M1');
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120000 }
  );
  await page.waitForTimeout(5000);
  await page.locator('.game-canvas').screenshot({ path: OUT });
  await browser.close();
  console.log({ out: OUT });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
