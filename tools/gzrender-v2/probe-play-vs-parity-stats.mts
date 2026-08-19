#!/usr/bin/env tsx
import puppeteer from 'puppeteer';
import { waitClassicPlaying } from './waitClassicPlaying.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:5150';

async function captureStats(label: string, query: string) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${BASE}/?renderer=classic&map=E1M1&${query}&_=${Date.now()}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await waitClassicPlaying(page);
    await new Promise((r) => setTimeout(r, 2500));
    const stats = await page.evaluate(() => {
      const s = (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats ?? {};
      return {
        walls: s.walls,
        wallEntries: s.wallEntries,
        flats: s.flats,
        skyActive: s.skyActive,
        gzdoomColormap: s.gzdoomColormap,
        inactiveLayers: s.inactiveLayers,
        cameraSectorIndex: s.cameraSectorIndex,
        flatDrawMode: s.flatDrawMode,
        layerPlan: s.layerPlan,
      };
    });
    console.log(`${label}:`, JSON.stringify(stats, null, 2));
    return stats;
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const play = await captureStats('PLAY', '');
  const parity = await captureStats('PARITY', 'frameParity=1');
  const wallsOk = (play.walls as number) >= 15 && (parity.walls as number) >= 15;
  if (!wallsOk) {
    console.error('FAIL: wall draw counts too low', { playWalls: play.walls, parityWalls: parity.walls });
    process.exit(1);
  }
  if (Math.abs((play.walls as number) - (parity.walls as number)) > 5) {
    console.error('WARN: wall count mismatch', play.walls, 'vs', parity.walls);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
