import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT_DIR = path.resolve('tmp-e1m1-verify');

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/?labels=1`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const mapSelect = (await page.$$('select'))[1];
  if (mapSelect) await mapSelect.select('E1M1');

  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120000 }
  );
  await new Promise((r) => setTimeout(r, 2500));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const viewport = await page.$('.game-card__viewport');
  if (viewport) {
    await viewport.screenshot({ path: path.join(OUT_DIR, 'e1m1-labeled-grid.png') });
  }
  await browser.close();
  console.log(`Saved ${path.join(OUT_DIR, 'e1m1-labeled-grid.png')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
