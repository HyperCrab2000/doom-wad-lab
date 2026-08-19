#!/usr/bin/env tsx
import puppeteer from 'puppeteer';
import { waitClassicPlaying } from './waitClassicPlaying.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:5150';

async function captureStats(renderer: 'classic' | 'modular') {
  const browser = await puppeteer.launch({
    headless: true,
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 480 });
  const params = new URLSearchParams({
    renderer,
    frameParity: '1',
    map: 'E1M1',
    _: String(Date.now()),
  });
  await page.goto(`${BASE}/?${params}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  if (renderer === 'classic') await waitClassicPlaying(page);
  else {
    await page.waitForFunction(
      () => document.querySelector('[data-map-load-state="ready"]'),
      { timeout: 120_000 },
    );
  }
  await new Promise((r) => setTimeout(r, 2500));
  const stats = await page.evaluate(() => (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats ?? null);
  await browser.close();
  return stats;
}

async function main() {
  const classic = await captureStats('classic');
  const modular = await captureStats('modular');
  console.log('classic', JSON.stringify(classic, null, 2));
  console.log('modular', JSON.stringify(modular, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
