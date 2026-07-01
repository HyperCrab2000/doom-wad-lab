#!/usr/bin/env tsx
/** Play tab with cleared storage — simulates first visit / hard refresh. */
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const WAIT_MS = Number(process.env.DIAG_WAIT_MS ?? '180000');
const URL = `${BASE}/?renderer=gzdoom-wasm&_=${Date.now()}`;

async function main() {
  const logs: string[] = [];
  const browser = await puppeteer.launch({
    headless: process.env.HEADED === '1' ? false : true,
    channel: 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || t.includes('useDoomLoader') || t.includes('WebGL') || t.includes('classic')) {
      logs.push(`[${m.type()}] ${t.slice(0, 400)}`);
    }
  });
  page.on('pageerror', (e) => logs.push(`PAGE: ${e.message}`));

  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    sessionStorage.clear();
    void indexedDB.databases?.().then((dbs) => {
      for (const db of dbs) indexedDB.deleteDatabase(db.name!);
    });
  });

  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 120_000 });

  const started = Date.now();
  let last: Record<string, unknown> = {};
  const timeline: Record<string, unknown>[] = [];

  while (Date.now() - started < WAIT_MS) {
    const s = await page.evaluate(() => {
      const viewer = document.querySelector('.level-viewer');
      const overlay = document.querySelector('.gzdoom-play-loading');
      return {
        classic: viewer?.getAttribute('data-classic-play-state'),
        mapLoad: viewer?.getAttribute('data-map-load-state'),
        isPlaying: viewer?.getAttribute('data-is-playing'),
        playOverlay: overlay != null && getComputedStyle(overlay).display !== 'none',
        overlayText: overlay?.textContent?.trim() ?? null,
        h2: document.querySelector('.loader-title-group h2')?.textContent ?? null,
        subView: document.querySelector('[data-gzdoom-subview]')?.getAttribute('data-gzdoom-subview') ?? null,
      };
    });
    s.t = Date.now() - started;
    timeline.push(s);
    last = s;

    if (s.classic === 'ready' && s.isPlaying === 'true' && !s.playOverlay) break;
    if (s.classic === 'error') break;

    await new Promise((r) => setTimeout(r, 2000));
  }

  const ok =
    last.classic === 'ready' &&
    last.isPlaying === 'true' &&
    !last.playOverlay;

  console.log(
    JSON.stringify(
      {
        ok,
        url: URL,
        elapsedMs: Date.now() - started,
        last,
        timeline: timeline.filter((_, i) => i % 3 === 0),
        logs,
      },
      null,
      2,
    ),
  );
  await browser.close();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
