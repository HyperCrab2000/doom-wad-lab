import puppeteer from 'puppeteer';
import { VISIBLE_PROBE_SCRIPT, measureVisibleGameCanvas } from '../test/browser/puppeteerVisibleProbe';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5151';

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(VISIBLE_PROBE_SCRIPT);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const wadSelect = await page.$('.level-toolbar select');
  if (wadSelect) await wadSelect.select('/wads/DOOM.WAD');
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120000 }
  );
  await new Promise((r) => setTimeout(r, 5000));
  const measure = await measureVisibleGameCanvas(page, 10);
  const drawStats = await page.evaluate(() => (window as unknown as { __doomDrawStats?: Record<string, number> }).__doomDrawStats ?? null);
  console.log(JSON.stringify({ measure, drawStats }, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
