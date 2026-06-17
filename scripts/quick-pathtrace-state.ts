import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    executablePath: CHROME,
  });
  const page = await browser.newPage();
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/?renderer=pathtrace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.level-toolbar select', { timeout: 30000 });
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const selects = await page.$$('select');
  if (selects[1]) await selects[1].select('E1M1');
  await new Promise((r) => setTimeout(r, 15000));
  const state = await page.evaluate(() => ({
    playing: document.querySelector('.level-viewer')?.getAttribute('data-is-playing'),
    hud: document.querySelector('.path-trace-hud')?.textContent,
    load: document.querySelector('.level-viewer')?.getAttribute('data-load-state'),
    err: document.querySelector('.level-viewer')?.getAttribute('data-load-error'),
  }));
  console.log(JSON.stringify({ state, logs: logs.slice(-20) }, null, 2));
  await browser.close();
}

main();
