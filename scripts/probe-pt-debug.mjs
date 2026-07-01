import puppeteer from 'puppeteer';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:5150/?renderer=pathtrace&ptDebug=1&_=${Date.now()}`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForSelector('.level-toolbar select');
await page.select('.level-toolbar select', '/wads/DOOM.WAD');
const mapSelect = await page.$$('select');
if (mapSelect[1]) await mapSelect[1].select('E1M1');
await page.waitForFunction(
  () => document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') === 'ready',
  { timeout: 120_000, polling: 500 }
);
await page.waitForFunction(
  () => window.__ptDebug?.fboNonSkyRatio != null,
  { timeout: 120_000, polling: 500 }
);
const dbg = await page.evaluate(() => window.__ptDebug);
console.log(JSON.stringify(dbg, null, 2));
await browser.close();
