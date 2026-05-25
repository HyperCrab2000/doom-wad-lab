/**
 * Browser test: Play E1M1 music via SoundfontEngine (same path as the UI).
 * Requires dev server: npm run dev
 */
import puppeteer from 'puppeteer';

const BASE_URL = process.env.MUSIC_TEST_URL ?? 'http://127.0.0.1:5173';

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const logs: string[] = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });

    await page.select('.level-toolbar select', '/wads/DOOM.WAD');
    await page.waitForFunction(
      () => {
        const selects = document.querySelectorAll('.level-toolbar select');
        return selects.length >= 2 && selects[1].querySelectorAll('option').length > 1;
      },
      { timeout: 15000 }
    );
    const mapSelect = await page.$$('.level-toolbar select');
    await mapSelect[1]!.select('E1M1');
    await page.waitForFunction(
      () => document.querySelector('.music-status strong')?.textContent?.includes('Ready'),
      { timeout: 60000 }
    );

    const beforeStatus = await page.$eval('.music-status strong', (el) => el.textContent);
    console.log('Status before play:', beforeStatus);

    await page.click('.music-status .doom-button');
    await new Promise((r) => setTimeout(r, 3000));

    const afterStatus = await page.$eval('.music-status strong', (el) => el.textContent);
    console.log('Status after play:', afterStatus);

    const bufferErrors = logs.filter((l) => l.includes('maxBufferSize'));
    if (logs.length) {
      console.log('\nConsole:');
      logs.slice(-20).forEach((l) => console.log(l));
    }

    if (bufferErrors.length > 0) {
      throw new Error(`maxBufferSize errors in console:\n${bufferErrors.join('\n')}`);
    }

    if (String(afterStatus).includes('Playing')) {
      console.log('\nOK: UI reports playing, no maxBufferSize errors');
    } else {
      throw new Error(`Expected Playing status, got: ${afterStatus}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
