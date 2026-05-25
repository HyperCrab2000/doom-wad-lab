import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5173';

async function main() {
  const errors: string[] = [];
  const warnings: string[] = [];
  const failedRequests: string[] = [];

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      if (/favicon\.ico/i.test(text)) return;
      errors.push(text);
    } else if (msg.type() === 'warning') warnings.push(text);
  });
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.stack ?? err.message}`));
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.failure()?.errorText ?? 'failed'} ${req.url()}`);
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('favicon.ico')) return;
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${url}`);
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.waitForSelector('select');
  await page.select('select', '/wads/DOOM2.WAD');
  console.log('Selected DOOM2.WAD');

  await new Promise((r) => setTimeout(r, 15000));

  const mapSelect = await page.$$('select');
  if (mapSelect.length >= 2) {
    await mapSelect[1].select('MAP01');
    console.log('Selected MAP01');
  }

  await new Promise((r) => setTimeout(r, 20000));

  const uniqueErrors = [...new Set(errors)];
  const uniqueFailed = [...new Set(failedRequests)];

  console.log(`\n=== CONSOLE ERRORS (${uniqueErrors.length}) ===`);
  uniqueErrors.slice(0, 60).forEach((e, i) => console.log(`${i + 1}. ${e.slice(0, 800)}`));

  console.log(`\n=== FAILED REQUESTS (${uniqueFailed.length}) ===`);
  uniqueFailed.slice(0, 60).forEach((u, i) => console.log(`${i + 1}. ${u.slice(0, 300)}`));

  const uniqueWarnings = [...new Set(warnings)];
  console.log(`\n=== WARNINGS (${uniqueWarnings.length}) ===`);
  uniqueWarnings.slice(0, 15).forEach((w, i) => console.log(`${i + 1}. ${w.slice(0, 400)}`));

  if (uniqueErrors.length > 0) {
    console.error(`\nFAILED: ${uniqueErrors.length} console error(s)`);
    process.exit(1);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
