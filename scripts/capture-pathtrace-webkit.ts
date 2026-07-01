import fs from 'node:fs';
import path from 'node:path';
import { webkit } from '@playwright/test';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT = path.resolve('tmp-e1m1-verify/webkit-pathtrace.png');

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE_URL}/?renderer=pathtrace`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('.level-toolbar select').first().selectOption('/wads/DOOM.WAD');
  await page.locator('select').nth(1).selectOption('E1M1');
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120000 }
  );
  await page.waitForTimeout(8000);
  await page.locator('.game-canvas').screenshot({ path: OUT });
  const hud = await page.locator('.path-trace-hud').textContent();
  await browser.close();
  console.log(JSON.stringify({ out: OUT, hud }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
