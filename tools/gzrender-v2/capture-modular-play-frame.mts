#!/usr/bin/env tsx
/** Capture GZDoom modular (s) play canvas for side-by-side parity checks. */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.BASE_URL ?? 'http://localhost:5150';
const MAP = process.argv[2] ?? 'E1M1';
const OUT =
  process.argv[3] ?? path.join(ROOT, 'artifacts/gzrender-v2/wadlab', `${MAP}-modular-play.png`);

async function main(): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/?renderer=gzdoom-s-wasm&map=${MAP}&_=${Date.now()}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await page.waitForSelector('.level-viewer');
    await page.waitForFunction(
      () => document.querySelector('.level-viewer')?.getAttribute('data-classic-play-state') === 'ready',
      { timeout: 240_000, polling: 300 },
    );
    await new Promise((r) => setTimeout(r, 2000));
    const canvas = await page.$('.gzdoom-wasm-play-canvas');
    if (!canvas) throw new Error('no gzdoom canvas');
    const shot = await canvas.screenshot({ type: 'png' });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, shot);
    console.log(`Modular play capture: ${OUT}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
