import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/?renderer=pathtrace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const selects = await page.$$('select');
  if (selects[1]) await selects[1].select('E1M1');

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const snap = await page.evaluate(() => ({
      load: document.querySelector('.level-viewer')?.getAttribute('data-map-load-state'),
      playing: document.querySelector('.level-viewer')?.getAttribute('data-is-playing'),
      hud: document.querySelector('.path-trace-hud')?.textContent?.slice(0, 120) ?? null,
      status: document.querySelector('.doom-loader')?.textContent?.slice(0, 80) ?? null,
    }));
    console.log(i, snap);
    if (snap.playing === 'true' && snap.load === 'ready') break;
  }
  console.log('errors', logs.filter((l) => /error|fail|shader/i.test(l)).slice(0, 15));
  await browser.close();
}

main();
