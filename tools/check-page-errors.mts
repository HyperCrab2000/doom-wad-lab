#!/usr/bin/env npx tsx
import puppeteer from 'puppeteer';

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
  });

  await page.goto('http://127.0.0.1:5150/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 3000));

  const root = await page.evaluate(() => ({
    rootChildCount: document.getElementById('root')?.childElementCount ?? 0,
    rootText: document.getElementById('root')?.textContent?.trim().slice(0, 200) ?? '',
    hasAppShell: Boolean(document.querySelector('.app-shell')),
  }));

  console.log(JSON.stringify({ root, errors }, null, 2));
  await browser.close();
  if (errors.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
