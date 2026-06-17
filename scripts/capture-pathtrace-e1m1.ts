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
  await page.goto(`${BASE_URL}/?renderer=pathtrace`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const selects = await page.$$('select');
  const mapSelect = selects[1];
  if (mapSelect) await mapSelect.select('E1M1');

  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120000 }
  );
  await new Promise((r) => setTimeout(r, 5000));

  const stats = await page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h).data;
    let nonSky = 0;
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i];
      const g = img[i + 1];
      const b = img[i + 2];
      const isSky = r > 100 && g > 140 && b > 200;
      if (!isSky) nonSky++;
    }
    return { w, h, nonSky, total: w * h };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const canvas = await page.$('.game-canvas');
  if (canvas) {
    await canvas.screenshot({ path: path.join(OUT_DIR, 'e1m1-pathtrace.png') });
  }
  await browser.close();
  console.log(JSON.stringify({ out: path.join(OUT_DIR, 'e1m1-pathtrace.png'), stats }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
