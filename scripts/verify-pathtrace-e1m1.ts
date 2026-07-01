import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT_DIR = path.resolve('tmp-e1m1-verify');

const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 600_000,
  };
  if (CHROME_PATH) {
    launchOpts.executablePath = CHROME_PATH;
  } else {
    launchOpts.channel = process.env.PUPPETEER_CHANNEL ?? 'chrome';
  }
  const browser = await puppeteer.launch(launchOpts);
  const page = await browser.newPage();
  page.setDefaultTimeout(600_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/?renderer=pathtrace`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const selects = await page.$$('select');
  if (selects[1]) await selects[1].select('E1M1');
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') === 'ready',
    { timeout: 120000, polling: 500 }
  );

  const hud = await page.waitForFunction(
    () => {
      const text = document.querySelector('.path-trace-hud')?.textContent ?? '';
      if (/GPU failed/i.test(text)) return text;
      if (/GPU ray cast/i.test(text) && /\d+\s*tris/i.test(text)) return text;
      return null;
    },
    { timeout: 600_000, polling: 2000 }
  ).then((h) => h.jsonValue() as Promise<string>);

  const shotPath = path.join(OUT_DIR, 'pathtrace-verify.png');
  await page.screenshot({ path: shotPath, fullPage: false });
  await browser.close();

  const triMatch = hud.match(/(\d+)\s*tris/i);
  const hitMatch = hud.match(/(\d+)%\s*hits/i);
  const tris = triMatch ? Number(triMatch[1]) : 0;
  const hits = hitMatch ? Number(hitMatch[1]) : 0;

  const result = { hud, tris, hits, screenshot: shotPath };
  console.log(JSON.stringify(result, null, 2));

  if (/GPU failed/i.test(hud)) {
    console.error('FAIL: GPU path trace failed:', hud);
    if (pageErrors.length) console.error('page errors:', pageErrors.slice(0, 5));
    process.exit(1);
  }
  if (!/GPU ray cast/i.test(hud)) {
    console.error('FAIL: expected GPU ray cast in HUD');
    process.exit(1);
  }
  if (tris < 100) {
    console.error('FAIL: too few triangles, tris=', tris);
    process.exit(1);
  }
  if (hits < 15 && !/0% center hits/i.test(hud)) {
    console.error('FAIL: center hit ratio too low, hits=', hits);
    process.exit(1);
  }
  console.log('PASS: GPU path trace running with geometry hits');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
