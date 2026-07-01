#!/usr/bin/env tsx
/**
 * Fails if Level Viewer map load is not ready within deadline (default 90s).
 * Catches the "P_SetupLevel / Building renderer buffers" hang.
 */
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const DEADLINE_MS = Number(process.env.MAP_LOAD_DEADLINE_MS ?? '90000');
const POLL_MS = 1000;

async function waitForMapReady(page: import('puppeteer').Page): Promise<Record<string, string | null>> {
  const started = Date.now();
  let last: Record<string, string | null> = {};

  while (Date.now() - started < DEADLINE_MS) {
    last = await page.evaluate(() => ({
      h2: document.querySelector('.loader-title-group h2')?.textContent ?? null,
      detail: document.querySelector('.loader-title-group p')?.textContent ?? null,
      statusLine: document.querySelector('.loader-status-line')?.textContent ?? null,
      mapLoad: document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') ?? null,
      isPlaying: document.querySelector('.level-viewer')?.getAttribute('data-is-playing') ?? null,
    }));
    if (last.mapLoad === 'ready') return last;
    if (last.mapLoad === 'error') return last;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return last;
}

async function runCase(name: string, url: string, init?: () => void) {
  const browser = await puppeteer.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  if (init) await page.evaluateOnNewDocument(init);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const wadSelect = await page.$('.level-toolbar select');
  if (wadSelect) await wadSelect.select('/wads/DOOM.WAD');

  const result = await waitForMapReady(page);
  await browser.close();

  const elapsed = DEADLINE_MS;
  const ok = result.mapLoad === 'ready';
  console.log(JSON.stringify({ name, url, ok, deadlineMs: DEADLINE_MS, ...result, errors: errors.slice(0, 5) }, null, 2));
  if (!ok) {
    console.error(`FAIL [${name}]: map not ready within ${elapsed}ms — stuck at h2=${result.h2} detail=${result.detail}`);
    process.exitCode = 1;
  }
}

async function main() {
  await runCase('classic-default', `${BASE}/`);
  await runCase('gzdoom-wasm', `${BASE}/?renderer=gzdoom-wasm`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
