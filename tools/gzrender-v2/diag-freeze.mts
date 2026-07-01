#!/usr/bin/env npx tsx
/**
 * Freeze probe: load GZDoom play, then poll gzr_gametic() over several seconds. If the tic does NOT
 * advance, the game sim is frozen (regardless of the JS perf counter, which is rAF-driven). Also
 * dumps any Aborted/RuntimeError console lines and screenshots the canvas.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2/app-play');
const RENDERER = process.env.RENDERER ?? 'gzdoom-wasm';
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 70_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  try {
    const page = await browser.newPage();
    const interesting: string[] = [];
    page.on('console', (m) => {
      const t = m.text();
      if (/HUDDBG|Aborted|RuntimeError|abort\(|stack|unreachable|gametic|Resolution/i.test(t)) {
        interesting.push(t);
        console.log('[console]', t);
      }
    });
    page.on('pageerror', (e) => { interesting.push('PAGEERROR ' + e.message); console.log('[pageerror]', e.message); });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const url = `${BASE}/?renderer=${encodeURIComponent(RENDERER)}&_=${Date.now()}`;
    console.log(`Navigating: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForSelector('canvas.gzdoom-wasm-play-canvas', { timeout: 180_000 });
    console.log(`Canvas exists; settling ${SETTLE_MS}ms...`);
    await sleep(SETTLE_MS);

    const tics: number[] = [];
    for (let i = 0; i < 6; i++) {
      const tic = await page.evaluate(() => {
        const m = (window as unknown as { __gzPlayModule?: { _gzr_gametic?: () => number } }).__gzPlayModule;
        return m && m._gzr_gametic ? m._gzr_gametic() : -1;
      });
      tics.push(tic);
      console.log(`gametic[${i}] = ${tic}`);
      await sleep(1500);
    }
    const advancing = tics[tics.length - 1]! > tics[0]! && tics[0]! >= 0;
    console.log(`FREEZE_RESULT tics=${JSON.stringify(tics)} simAdvancing=${advancing}`);

    const c = await page.$('canvas.gzdoom-wasm-play-canvas');
    if (c) await c.screenshot({ path: path.join(OUT_DIR, 'gzdoom-freeze-canvas.png') });
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
