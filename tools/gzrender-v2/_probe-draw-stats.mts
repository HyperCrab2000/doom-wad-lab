#!/usr/bin/env tsx
import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5150';

const browser = await puppeteer.launch({ headless: true, channel: 'chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE', m.text());
});
await page.goto(`${BASE}/?renderer=classic&map=E1M1&spawnLock=1&frameParity=1`, {
  waitUntil: 'domcontentloaded',
  timeout: 60_000,
});
await page.waitForSelector('.level-viewer', { timeout: 30_000 });
await new Promise((r) => setTimeout(r, 10_000));
const stats = await page.evaluate(() => ({
  stats: (window as unknown as { __doomDrawStats?: unknown }).__doomDrawStats,
  ready: (window as unknown as { __doomGoldPlayfieldReady?: boolean }).__doomGoldPlayfieldReady,
  canvasW: (document.querySelector('.game-canvas') as HTMLCanvasElement | null)?.width,
}));
console.log(JSON.stringify(stats, null, 2));
await browser.close();
