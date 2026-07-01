#!/usr/bin/env npx tsx
/**
 * Capture Classic layer isolation screenshots for docs/bible/classic-layers/screenshots/
 *
 * Usage: npx tsx tools/gzrender-v2/capture-classic-layer-screenshots.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const OUT = path.resolve(import.meta.dirname, '../../docs/bible/classic-layers/screenshots');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PRESETS = ['all', 'walls-solid', 'floors', 'ceilings', 'sky', 'walls-off'] as const;

async function forcePreserveDrawingBuffer(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    const orig = HTMLCanvasElement.prototype.getContext as (
      this: HTMLCanvasElement,
      id: string,
      attrs?: unknown,
    ) => unknown;
    HTMLCanvasElement.prototype.getContext = function (id: string, attrs?: Record<string, unknown>) {
      if (id === 'webgl2' || id === 'webgl') attrs = { ...(attrs ?? {}), preserveDrawingBuffer: true };
      return orig.call(this, id, attrs);
    } as typeof orig;
  });
}

async function waitClassicReady(page: Page): Promise<void> {
  for (let i = 0; i < 300; i++) {
    const state = await page.evaluate(() => ({
      mapState: document.querySelector('.level-viewer')?.getAttribute('data-map-load-state'),
      playing: document.querySelector('.level-viewer')?.getAttribute('data-is-playing'),
      canvasHidden: document.querySelector('canvas.game-canvas')?.classList.contains('game-canvas--hidden'),
    }));
    if (state.mapState === 'ready' && state.playing === 'true' && !state.canvasHidden) return;
    if (state.mapState === 'error') throw new Error('classic map load error');
    await sleep(400);
  }
  throw new Error('timeout waiting for classic ready');
}

async function applyPreset(page: Page, preset: string): Promise<void> {
  const ok = await page.evaluate((p) => {
    const fn = (window as unknown as { __applyClassicLayerPreset?: (id: string) => unknown })
      .__applyClassicLayerPreset;
    if (!fn) return false;
    fn(p);
    return true;
  }, preset);
  if (!ok) throw new Error('__applyClassicLayerPreset not exposed — is renderer=classic?');
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await forcePreserveDrawingBuffer(page);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/?renderer=classic&map=E1M1&_=${Date.now()}`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await waitClassicReady(page);
  await sleep(2500);

  for (const preset of PRESETS) {
    await applyPreset(page, preset);
    await sleep(1500);
    const outPath = path.join(OUT, `e1m1-${preset}.png`);
    const canvas = await page.$('canvas.game-canvas:not(.game-canvas--hidden)');
    if (canvas) {
      await canvas.screenshot({ path: outPath as `${string}.png` });
      console.log('wrote', outPath);
    } else {
      console.warn('no visible canvas for preset', preset);
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
