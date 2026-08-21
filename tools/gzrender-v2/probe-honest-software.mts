#!/usr/bin/env npx tsx
import puppeteer from 'puppeteer';
import { diffRgbaBuffers, extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';
import { ensureParityServer, launchParityBrowser, prepareParityPage, stopParityPreviewServer } from './lib/parityHarness.ts';

const TOL = 8;
const W = 320;
const H = 168;
const REGIONS = [
  { id: 'ceiling', y0: 0, y1: 42 },
  { id: 'mid-upper', y0: 42, y1: 84 },
  { id: 'mid-lower', y0: 84, y1: 126 },
  { id: 'floor', y0: 126, y1: 168 },
] as const;

async function evalCapture(label: string, url: string): Promise<void> {
  await ensureParityServer();
  const browser = await launchParityBrowser();
  const page = await browser.newPage();
  await prepareParityPage(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () =>
      (window as unknown as { __DOOM_PARITY_READY__?: boolean }).__DOOM_PARITY_READY__ === true ||
      Boolean((window as unknown as { __DOOM_PARITY_ERROR__?: string }).__DOOM_PARITY_ERROR__),
    { timeout: 240_000 },
  );
  const err = await page.evaluate(
    () => (window as unknown as { __DOOM_PARITY_ERROR__?: string }).__DOOM_PARITY_ERROR__,
  );
  if (err) throw new Error(err);
  const canvas = await page.$('canvas.parity-frame');
  if (!canvas) throw new Error('parity frame canvas missing');
  const shot = Buffer.from(await canvas.screenshot({ type: 'png' }));
  await browser.close();
  stopParityPreviewServer();

  const goldPath = 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png';
  const classicImg = await loadPng(shot);
  const goldImg = await loadPng(goldPath);
  const classicView = extractGzdoomView(classicImg.data, classicImg.width, classicImg.height);
  const goldView = extractGzdoomView(goldImg.data, goldImg.width, goldImg.height);
  const classic = resizePlayfieldToVanilla(classicView.data, classicView.width, classicView.height);
  const gold = resizePlayfieldToVanilla(goldView.data, goldView.width, goldView.height);
  const pf = diffRgbaBuffers(classic.data, gold.data, W, H, { x: 0, y: 0, width: W, height: H }, TOL);
  const full = diffRgbaBuffers(
    classicImg.data,
    goldImg.data,
    classicImg.width,
    classicImg.height,
    { x: 0, y: 0, width: classicImg.width, height: classicImg.height },
    TOL,
  );
  const hud = diffRgbaBuffers(
    classicImg.data,
    goldImg.data,
    classicImg.width,
    classicImg.height,
    { x: 0, y: 403, width: classicImg.width, height: 77 },
    TOL,
  );
  console.log(label);
  console.log(
    `  pf ${(pf.mismatchRatio * 100).toFixed(2)}% full ${(full.mismatchRatio * 100).toFixed(2)}% hud ${(hud.mismatchRatio * 100).toFixed(2)}%`,
  );
  for (const r of REGIONS) {
    const d = diffRgbaBuffers(classic.data, gold.data, W, H, { x: 0, y: r.y0, width: W, height: r.y1 - r.y0 }, TOL);
    console.log(`  ${r.id} ${(d.mismatchRatio * 100).toFixed(2)}%`);
  }
}

const base = 'http://127.0.0.1:4173/parity-capture.html?map=E1M1&wad=/wads/DOOM.WAD&honestParity=1';
await evalCapture('GPU honest', base);
await evalCapture('Software honest', `${base}&softwareParity=1`);
