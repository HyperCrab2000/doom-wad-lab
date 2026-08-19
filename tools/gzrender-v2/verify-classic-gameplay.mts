#!/usr/bin/env npx tsx
/**
 * Automated Classic gameplay smoke checks (pause menu, combat debug).
 * Requires: npm run dev on :5150
 */
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { waitClassicPlaying } from './waitClassicPlaying.ts';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function loadClassicPlay(page: Page, map = 'E1M1'): Promise<void> {
  const url = `${BASE}/?renderer=classic&map=${encodeURIComponent(map)}&_=${Date.now()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const wadSelect = await page.$('.level-chrome__selects select');
  if (wadSelect) await wadSelect.select('/wads/DOOM.WAD');
  await waitClassicPlaying(page);
}

async function testPauseMenu(page: Page): Promise<{ ok: boolean; detail: string }> {
  await loadClassicPlay(page, 'E1M1');
  const canvas = await page.$('canvas.game-canvas');
  if (!canvas) return { ok: false, detail: 'no game canvas' };

  const box = await canvas.boundingBox();
  if (!box) return { ok: false, detail: 'canvas has no bounding box' };
  await canvas.click({ offset: { x: box.width / 2, y: box.height / 2 } });

  await page.waitForFunction(
    () => document.pointerLockElement instanceof HTMLCanvasElement,
    { timeout: 5000 },
  ).catch(() => null);

  const locked = await page.evaluate(() => document.pointerLockElement instanceof HTMLCanvasElement);
  if (!locked) {
    // Some headless builds skip pointer lock; toggle menu without lock.
    await page.keyboard.press('Escape');
  } else {
    await page.keyboard.press('Escape');
    await sleep(200);
  }

  const menu = await page.evaluate(() => {
    const overlay = document.querySelector('.doom-patch-menu--active');
    const canvas = overlay?.querySelector('canvas');
    return {
      present: Boolean(overlay),
      hasCanvas: Boolean(canvas),
    };
  });

  const visible = menu.present && menu.hasCanvas;
  return {
    ok: visible,
    detail: visible ? 'patch menu canvas visible' : 'patch menu missing',
  };
}

async function testCombatDebug(page: Page): Promise<{ ok: boolean; detail: string }> {
  await loadClassicPlay(page, 'E1M1');
  await page.keyboard.down('ControlLeft');
  await sleep(100);
  await page.keyboard.up('ControlLeft');
  await sleep(800);

  const debug = await page.evaluate(() => {
    const d = (window as Window & { __doomCombatDebug?: Record<string, unknown> }).__doomCombatDebug;
    return d ?? null;
  });

  if (!debug) return { ok: false, detail: '__doomCombatDebug never set' };
  return {
    ok: typeof debug.fired === 'boolean',
    detail: `fired=${String(debug.fired)} weapon=${String(debug.weapon)}`,
  };
}

async function main(): Promise<void> {
  if (!(await isServerUp())) {
    console.error(`FAIL: dev server not reachable at ${BASE}`);
    process.exit(1);
  }

  let browser: Browser | null = null;
  const results: { name: string; ok: boolean; detail: string }[] = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    results.push({ name: 'pause menu (Escape)', ...(await testPauseMenu(page)) });
    results.push({ name: 'combat debug (Ctrl fire)', ...(await testCombatDebug(page)) });

    if (errors.length > 0) {
      results.push({ name: 'browser console', ok: false, detail: errors.slice(0, 3).join(' | ') });
    }
  } finally {
    await browser?.close();
  }

  let failed = 0;
  for (const row of results) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.name}: ${row.detail}`);
    if (!row.ok) failed++;
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
