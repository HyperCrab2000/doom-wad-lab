#!/usr/bin/env npx tsx
/** Capture [gzr-mouse] diagnostic logs from the real React Play tab. */
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-features=SharedArrayBuffer'],
  channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
});
const logs: string[] = [];
try {
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[gzr-mouse]') || t.includes('[gzdoom]')) logs.push(t);
  });
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE}/?renderer=gzdoom-wasm&_=${Date.now()}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForSelector('canvas.gzdoom-wasm-play-canvas', { timeout: 150_000 });
  await sleep(3000);
  const canvas = await page.$('canvas.gzdoom-wasm-play-canvas');
  if (!canvas) throw new Error('no play canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(500);
  // Simulate relative motion while pointer lock may be active
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(box.x + box.width / 2 + i * 12, box.y + box.height / 2);
    await sleep(80);
  }
  await sleep(1500);
  const locked = await page.evaluate(() => document.pointerLockElement?.tagName ?? 'none');
  console.log('pointerLockElement:', locked);
  console.log('--- gzr-mouse / gzdoom logs ---');
  for (const l of logs.filter((x) => x.includes('[gzr-mouse]'))) console.log(l);
  if (!logs.some((x) => x.includes('[gzr-mouse]'))) {
    console.log('(no [gzr-mouse] lines — last 15 gzdoom logs)');
    for (const l of logs.slice(-15)) console.log(l);
  }
} finally {
  await browser.close();
}
