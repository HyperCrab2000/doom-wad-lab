import puppeteer from 'puppeteer';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  const logs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') {
      logs.push(`error: ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

  await page.goto('http://127.0.0.1:5150/?renderer=pathtrace', {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const selects = await page.$$('select');
  if (selects[1]) await selects[1].select('E1M1');

  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120000 }
  );
  await new Promise((r) => setTimeout(r, 8000));

  const info = await page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    return {
      width: canvas?.width ?? 0,
      height: canvas?.height ?? 0,
      rendererValue: (document.querySelectorAll('.level-toolbar select')[2] as HTMLSelectElement | undefined)
        ?.value,
    };
  });

  console.log(JSON.stringify({ info, logs: logs.filter((l) => !l.includes('vite')) }, null, 2));
  await browser.close();
}

main();
