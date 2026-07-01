#!/usr/bin/env tsx
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const WAIT_MS = Number(process.env.REPRO_WAIT_MS ?? '90000');
const POLL_MS = 2000;

async function probe(name: string, url: string, init?: () => void) {
  const browser = await puppeteer.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  if (init) await page.evaluateOnNewDocument(init);
  const logs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().toLowerCase().includes('failed')) {
      logs.push(m.text().slice(0, 300));
    }
  });
  page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message.slice(0, 300)}`));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

  const wadSelect = await page.$('.level-toolbar select');
  if (wadSelect) await wadSelect.select('/wads/DOOM.WAD');

  const started = Date.now();
  let st: Record<string, string | null> = {};
  while (Date.now() - started < WAIT_MS) {
    st = await page.evaluate(() => ({
      h2: document.querySelector('.loader-title-group h2')?.textContent ?? null,
      detail: document.querySelector('.loader-title-group p')?.textContent?.slice(0, 250) ?? null,
      statusLine: document.querySelector('.loader-status-line')?.textContent?.slice(0, 200) ?? null,
      mapLoad: document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') ?? null,
      classicPlay: document.querySelector('.level-viewer')?.getAttribute('data-classic-play-state') ?? null,
      isPlaying: document.querySelector('.level-viewer')?.getAttribute('data-is-playing') ?? null,
    }));
    const playReady = st.isPlaying === 'true' || st.classicPlay === 'ready';
    if (st.mapLoad === 'ready' || st.mapLoad === 'error' || playReady) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  const elapsedMs = Date.now() - started;
  const ok = st.mapLoad === 'ready' || st.isPlaying === 'true' || st.classicPlay === 'ready';
  console.log(JSON.stringify({ name, url, ok, elapsedMs, ...st, logs: logs.slice(0, 8) }, null, 2));
  await browser.close();
  if (!ok) {
    throw new Error(`[${name}] map load did not reach ready within ${WAIT_MS}ms (stuck at h2=${st.h2})`);
  }
}

async function main() {
  await probe('default', `${BASE}/`);
  await probe('gzdoom-wasm-url', `${BASE}/?renderer=gzdoom-wasm`);
  await probe('classic-session', `${BASE}/`, () => {
    sessionStorage.setItem('doom-render-backend', 'classic');
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
