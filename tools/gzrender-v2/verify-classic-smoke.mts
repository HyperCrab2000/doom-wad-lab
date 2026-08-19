#!/usr/bin/env npx tsx
/**
 * Classic WebGL smoke suite — run before claiming menu/graphics fixes work.
 * Requires: npm run dev on :5150
 *
 *   TEST_URL=http://127.0.0.1:5150 npm run test:classic-smoke
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import {
  measureVisibleGameCanvas,
  VISIBLE_PROBE_SCRIPT,
} from '../../test/browser/puppeteerVisibleProbe.ts';
import { waitClassicPlaying } from './waitClassicPlaying.ts';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT_DIR = path.join(process.cwd(), 'tmp-classic-smoke');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row {
  name: string;
  ok: boolean;
  detail: string;
}

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function loadClassic(page: Page, map = 'E1M1'): Promise<void> {
  const url = `${BASE}/?renderer=classic&map=${encodeURIComponent(map)}&_=${Date.now()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const wadSelect = await page.$('.level-chrome__selects select');
  if (wadSelect) await wadSelect.select('/wads/DOOM.WAD');
  await waitClassicPlaying(page);
}

async function readMenuPixels(page: Page): Promise<{
  present: boolean;
  hasCanvas: boolean;
  nonBlackSamples: number;
  totalSamples: number;
}> {
  return page.evaluate(() => {
    const overlay = document.querySelector('.doom-patch-menu--active');
    const menuCanvas = overlay?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!overlay || !menuCanvas || menuCanvas.width < 8 || menuCanvas.height < 8) {
      return { present: Boolean(overlay), hasCanvas: Boolean(menuCanvas), nonBlackSamples: 0, totalSamples: 0 };
    }
    const ctx = menuCanvas.getContext('2d');
    if (!ctx) {
      return { present: true, hasCanvas: true, nonBlackSamples: 0, totalSamples: 0 };
    }
    const w = menuCanvas.width;
    const h = menuCanvas.height;
    const img = ctx.getImageData(0, 0, w, h).data;
    let nonBlack = 0;
    let total = 0;
    const stepX = Math.max(1, Math.floor(w / 16));
    const stepY = Math.max(1, Math.floor(h / 16));
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const i = (y * w + x) * 4;
        total++;
        if (img[i]! > 8 || img[i + 1]! > 8 || img[i + 2]! > 8) nonBlack++;
      }
    }
    return { present: true, hasCanvas: true, nonBlackSamples: nonBlack, totalSamples: total };
  });
}

async function openPauseMenu(page: Page, key: 'Escape' | 'KeyM'): Promise<void> {
  const canvas = await page.$('canvas.game-canvas');
  if (!canvas) throw new Error('no game canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await canvas.click({ offset: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForFunction(
    () => document.pointerLockElement instanceof HTMLCanvasElement,
    { timeout: 5000 },
  ).catch(() => null);
  if (key === 'Escape') {
    await page.keyboard.press('Escape');
  } else {
    await page.keyboard.press('m');
  }
  await sleep(350);
}

async function testAppShell(page: Page): Promise<Row> {
  const shell = await page.evaluate(() => ({
    appShell: Boolean(document.querySelector('.app-shell')),
    levelViewer: Boolean(document.querySelector('.level-viewer')),
    rootChildren: document.getElementById('root')?.childElementCount ?? 0,
  }));
  const ok = shell.appShell && shell.levelViewer && shell.rootChildren > 0;
  return {
    name: 'app shell renders (no white screen)',
    ok,
    detail: ok
      ? 'app-shell + level-viewer present'
      : `appShell=${shell.appShell} levelViewer=${shell.levelViewer} rootChildren=${shell.rootChildren}`,
  };
}

async function testClassicBackend(page: Page): Promise<Row> {
  await loadClassic(page);
  const info = await page.evaluate(() => {
    const viewer = document.querySelector('.level-viewer');
    return {
      backend: viewer?.getAttribute('data-render-backend') ?? null,
      playing: viewer?.getAttribute('data-is-playing') ?? null,
      mapReady: viewer?.getAttribute('data-map-load-state') ?? null,
    };
  });
  const ok =
    info.backend === 'classic' && info.playing === 'true' && info.mapReady === 'ready';
  return {
    name: 'Classic WebGL backend playing E1M1',
    ok,
    detail: `backend=${info.backend} playing=${info.playing} map=${info.mapReady}`,
  };
}

async function testSpawnNotMostlyBlack(page: Page): Promise<Row> {
  await loadClassic(page);
  const probe = await measureVisibleGameCanvas(page, 10);
  const ok = probe.isPlaying && probe.mapLoadState === 'ready' && probe.blackRatio < 0.55;
  return {
    name: 'spawn view draws geometry',
    ok,
    detail: `blackRatio=${(probe.blackRatio * 100).toFixed(1)}% playing=${probe.isPlaying} map=${probe.mapLoadState}`,
  };
}

async function testPauseMenuKey(page: Page, key: 'Escape' | 'KeyM'): Promise<Row> {
  await loadClassic(page);
  await openPauseMenu(page, key);
  const menu = await readMenuPixels(page);
  const shot = path.join(OUT_DIR, `menu-${key.toLowerCase()}.png`);
  const menuCanvas = await page.$('.doom-patch-menu__canvas');
  if (menuCanvas) await menuCanvas.screenshot({ path: shot });

  const ok =
    menu.present &&
    menu.hasCanvas &&
    menu.totalSamples > 0 &&
    menu.nonBlackSamples / menu.totalSamples > 0.15;
  return {
    name: `patch pause menu (${key === 'Escape' ? 'Esc' : 'M'})`,
    ok,
    detail: ok
      ? `${Math.round((menu.nonBlackSamples / menu.totalSamples) * 100)}% non-black pixels · ${shot}`
      : `present=${menu.present} canvas=${menu.hasCanvas} nonBlack=${menu.nonBlackSamples}/${menu.totalSamples}`,
  };
}

async function main(): Promise<void> {
  if (!(await isServerUp())) {
    console.error(`FAIL: dev server not reachable at ${BASE}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let browser: Browser | null = null;
  const results: Row[] = [];
  const consoleErrors: string[] = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
    });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(VISIBLE_PROBE_SCRIPT);
    await page.setViewport({ width: 1280, height: 900 });
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });

    await page.goto(`${BASE}/?renderer=classic`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    results.push(await testAppShell(page));
    results.push(await testClassicBackend(page));
    results.push(await testSpawnNotMostlyBlack(page));
    results.push(await testPauseMenuKey(page, 'Escape'));
    results.push(await testPauseMenuKey(page, 'KeyM'));
  } finally {
    await browser?.close();
  }

  if (consoleErrors.length > 0) {
    results.push({
      name: 'browser console',
      ok: false,
      detail: consoleErrors.slice(0, 3).join(' | '),
    });
  }

  let failed = 0;
  console.log(`\nClassic smoke @ ${BASE}\n`);
  for (const row of results) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.name}: ${row.detail}`);
    if (!row.ok) failed++;
  }

  console.log('\nNote: spawn parity gate (≤15% vs gold) is separate: npm run test:classic-gzdoom-parity');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
