#!/usr/bin/env tsx
/** Diagnose GZDoom (s) modular play until ready or error (default 180s). */
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const WAIT_MS = Number(process.env.DIAG_WAIT_MS ?? '180000');
const URL = `${BASE}/?renderer=gzdoom-s-wasm`;

async function main() {
  const logs: string[] = [];
  const browser = await puppeteer.launch({
    headless: process.env.HEADED === '1' ? false : true,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.text();
    logs.push(`[${m.type()}] ${t.slice(0, 500)}`);
  });
  page.on('pageerror', (e) => logs.push(`PAGE: ${e.message}`));

  await page.setViewport({ width: 1280, height: 900 });
  console.log('Navigating:', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const started = Date.now();
  let last: Record<string, unknown> = {};
  let readyAt = 0;

  while (Date.now() - started < WAIT_MS) {
    const s = await page.evaluate(() => {
      const viewer = document.querySelector('.level-viewer');
      const gz = document.querySelector('canvas.gzdoom-wasm-play-canvas') as HTMLCanvasElement | null;
      const errEl = document.querySelector('.gzdoom-play-error');
      const overlay = document.querySelector('.gzdoom-play-loading:not(.gzdoom-play-error)');
      const hud = document.querySelector('.gzdoom-wasm-hud')?.textContent?.trim() ?? null;
      let pixel: number[] | null = null;
      if (gz && gz.width > 0) {
        const gl = gz.getContext('webgl2');
        if (gl) {
          const p = new Uint8Array(4);
          gl.readPixels(Math.floor(gz.width / 2), Math.floor(gz.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
          pixel = Array.from(p);
        }
      }
      return {
        classic: viewer?.getAttribute('data-classic-play-state'),
        mapLoad: viewer?.getAttribute('data-map-load-state'),
        playOverlay: overlay?.textContent?.trim() ?? null,
        errorOverlay: errEl?.textContent?.trim() ?? null,
        hud,
        canvas: gz ? { w: gz.width, h: gz.height, display: getComputedStyle(gz).display } : null,
        centerPixel: pixel,
      };
    });

    if (JSON.stringify(s) !== JSON.stringify(last)) {
      console.log(JSON.stringify(s));
      last = s;
    }

    if (s.classic === 'ready' && !readyAt) {
      readyAt = Date.now();
      console.log('--- logs at ready (first 60) ---');
      for (const l of logs.slice(0, 60)) console.log(l);
    }

    const pxSum = s.centerPixel ? s.centerPixel[0]! + s.centerPixel[1]! + s.centerPixel[2]! : 0;
    if (s.classic === 'ready' && pxSum > 24) {
      console.log('PASS: GZDoom (s) play ready with non-black frame');
      await page.screenshot({ path: 'artifacts/gzrender-v2/gzdoom-s-play-diag.png' });
      await browser.close();
      return;
    }
    if (s.classic === 'error' || s.errorOverlay) {
      console.error('FAIL: play error state');
      console.error(s.errorOverlay ?? s.hud);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.error('Recent console logs:');
  for (const l of logs.slice(-30)) console.error(l);
  console.error('--- logs 55-130 (map load / gzstate) ---');
  for (const l of logs.slice(55, 130)) console.error(l);
  await browser.close();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
