import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const OUT_DIR = path.resolve('tmp-e1m1-verify');

async function capture(renderer: string, outName: string) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:5150/?renderer=${renderer}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const selects = await page.$$('select');
  if (selects[1]) await selects[1].select('E1M1');
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120000 }
  );
  await new Promise((r) => setTimeout(r, 5000));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const canvas = await page.$('.game-canvas');
  if (canvas) await canvas.screenshot({ path: path.join(OUT_DIR, outName) });
  await browser.close();
}

async function main() {
  await capture('classic', 'e1m1-classic-compare.png');
  await capture('pathtrace', 'e1m1-pathtrace-compare.png');
  console.log('done');
}

main();
