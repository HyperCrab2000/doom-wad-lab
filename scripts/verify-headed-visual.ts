/**
 * Headed check: must pass element screenshot (what the user sees), not just readPixels.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import {
  measureVisibleGameCanvas,
  VISIBLE_PROBE_SCRIPT,
} from '../test/browser/puppeteerVisibleProbe';
import { blackRatioFromPngBuffer } from '../test/browser/screenshotBlackRatio';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT = path.join(process.cwd(), 'tmp-headed-verify');
const MAX_BLACK = 0.45;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.evaluateOnNewDocument(VISIBLE_PROBE_SCRIPT);
  await page.setViewport({ width: 1280, height: 900 });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') === 'ready',
    { timeout: 120_000 }
  );
  await new Promise((r) => setTimeout(r, 8000));

  const measure = await measureVisibleGameCanvas(page, 10);
  const gameEl = (await page.$('.game-display')) ?? (await page.$('.game-canvas'));
  if (gameEl) {
    const png = await gameEl.screenshot();
    fs.writeFileSync(path.join(OUT, 'game-display.png'), png);
    const shot = await blackRatioFromPngBuffer(png, 10);
    console.log('puppeteerScreenshotBlackRatio', shot.blackRatio, 'center', shot.center);
  }

  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(measure, null, 2));
  console.log(JSON.stringify(measure, null, 2));

  await browser.close();

  if (!measure.hasWebgl) {
    console.error('FAIL: no WebGL2 on game canvas');
    process.exit(1);
  }
  if (measure.glBlackRatio > MAX_BLACK) {
    console.error(`FAIL: WebGL readPixels black (ratio=${measure.glBlackRatio})`);
    process.exit(1);
  }
  if (measure.imgBlackRatio > MAX_BLACK) {
    console.error(`FAIL: visible game image black (imgBlackRatio=${measure.imgBlackRatio})`);
    process.exit(1);
  }

  console.log('PASS: WebGL and visible game image show the level');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
