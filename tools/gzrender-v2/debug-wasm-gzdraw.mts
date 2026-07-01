#!/usr/bin/env npx tsx
/** Debug WASM GZDRAW — capture browser console to stderr. */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const MAP = 'E1M1';
const GZSTATE = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/gzdoom.gzstate');

async function main(): Promise<void> {
  const gzBytes = fs.readFileSync(GZSTATE);
  const logs: string[] = [];
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-features=SharedArrayBuffer'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  try {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
    await page.evaluateOnNewDocument((name, bytes) => {
      window.__gzdoomOracleGzstate = { name, bytes: Uint8Array.from(bytes) };
    }, `${MAP}.gzstate`, [...gzBytes]);
    await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
    const url = `${BASE}/gzdoom-oracle.html?capture=${MAP}&iwad=%2Fwads%2FDOOM.WAD&gzdraw=1&view=1056%2C-3616%2C90&probeId=0`;
    console.log('nav', url);
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(
      () => window.__gzdoomOracleCapture?.done === true || window.__gzdoomOracleCapture?.error != null,
      { timeout: 60_000, polling: 250 },
    ).catch(() => {});
    const cap = await page.evaluate(() => window.__gzdoomOracleCapture);
    console.log('capture state', cap);
  } finally {
    await browser.close();
    const out = path.join(ROOT, 'artifacts/gzrender-v2/logs/wasm-gzdraw-debug.log');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, logs.join('\n'));
    console.log(`wrote ${logs.length} log lines -> ${out}`);
    console.log(logs.slice(-40).join('\n'));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
