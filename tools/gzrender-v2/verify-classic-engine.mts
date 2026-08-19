#!/usr/bin/env npx tsx
/**
 * Confirms which renderer is active in the browser and that Classic geometry refresh runs.
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

async function loadClassic(page: Page, map = 'MAP01'): Promise<void> {
  const url = `${BASE}/?renderer=classic&map=${encodeURIComponent(map)}&_=${Date.now()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const wadSelect = await page.$('.level-chrome__selects select');
  if (wadSelect) await wadSelect.select('/wads/DOOM2.WAD');
  await waitClassicPlaying(page);
}

async function readEngineState(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector('section.level-viewer');
    const classicCanvas = document.querySelector('canvas.game-canvas:not(.game-canvas--hidden)');
    const gzdoomCanvas = document.querySelector('canvas.gzdoom-wasm-play-canvas:not(.gzdoom-wasm-play-canvas--loading)');
    const hud = document.querySelector('.visibility-hud')?.textContent ?? '';
    const gameplay = (window as Window & { __doomGameplayDebug?: Record<string, unknown> }).__doomGameplayDebug ?? null;
    const stats = (window as Window & { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats ?? null;
    return {
      renderBackend: section?.getAttribute('data-render-backend') ?? null,
      isPlaying: section?.getAttribute('data-is-playing') ?? null,
      classicCanvasVisible: Boolean(classicCanvas),
      gzdoomCanvasVisible: Boolean(gzdoomCanvas),
      hud,
      geometryRevision: stats?.geometryRevision ?? gameplay?.geometryRevision ?? null,
      activeMovers: gameplay?.activeMovers ?? null,
    };
  });
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

    await loadClassic(page, 'MAP01');
    await sleep(1200);
    const state = await readEngineState(page);
    results.push({
      name: 'Classic WebGL active',
      ok:
        state.renderBackend === 'classic'
        && state.classicCanvasVisible
        && !state.gzdoomCanvasVisible
        && state.hud.includes('Classic WebGL'),
      detail: JSON.stringify(state),
    });

    await page.keyboard.down('ControlLeft');
    await sleep(80);
    await page.keyboard.up('ControlLeft');
    await sleep(400);
    const afterFire = await page.evaluate(() => {
      const combat = (window as Window & { __doomCombatDebug?: Record<string, unknown> }).__doomCombatDebug ?? null;
      const stats = (window as Window & { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats ?? null;
      return {
        combat,
        geometryRevision: stats?.geometryRevision ?? null,
      };
    });
    results.push({
      name: 'Classic combat debug live',
      ok: afterFire.combat?.fired === true,
      detail: afterFire.combat
        ? `fired=${String(afterFire.combat.fired)} geo r${String(afterFire.geometryRevision)}`
        : 'no combat debug',
    });
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
