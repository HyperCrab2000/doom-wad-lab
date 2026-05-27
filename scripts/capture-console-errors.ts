import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const SMOKE_WAIT_MS = Number(process.env.SMOKE_WAIT_MS ?? 5000);

async function main() {
  const errors: string[] = [];
  const warnings: string[] = [];
  const failedRequests: string[] = [];

  const browser = await puppeteer.launch({
    headless: true,
    args:
      process.env.CI === 'true'
        ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        : [],
  });
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
    const url = req.url();
    if (/favicon\.ico/i.test(url)) return;
    failedRequests.push(`${req.failure()?.errorText ?? 'failed'} ${url}`);
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('favicon.ico')) return;
    if (res.status() >= 400 && !url.includes('/wads/DOOM') && !url.includes('/wads/doom')) {
      failedRequests.push(`${res.status()} ${url}`);
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.app-main', { timeout: 30000 });
  console.log('Loaded app shell');

  await new Promise((r) => setTimeout(r, SMOKE_WAIT_MS));

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
