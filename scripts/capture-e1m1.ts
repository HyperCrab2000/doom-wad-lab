import fs from 'node:fs';
import puppeteer from 'puppeteer';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5150/', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const mapSelect = (await page.$$('select'))[1];
  if (mapSelect) await mapSelect.select('E1M1');

  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120000 }
  );
  await new Promise((r) => setTimeout(r, 2000));

  fs.mkdirSync('tmp-e1m1-verify', { recursive: true });
  const canvas = await page.$('.game-canvas');
  if (canvas) {
    await canvas.screenshot({ path: 'tmp-e1m1-verify/reverted-spawn.png' });
  }
  await browser.close();
  console.log('Saved tmp-e1m1-verify/reverted-spawn.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
