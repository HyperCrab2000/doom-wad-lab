#!/usr/bin/env npx tsx
/**
 * Stage A validation — GZDoom WASM live interactive loop in the browser.
 *
 * Verifies:
 *   1. Engine starts via `?play=<map>` (no gzstate, no capture/exit).
 *   2. Tab stays RESPONSIVE — page.evaluate round-trips after the loop is running,
 *      proving D_DoomLoop yields to the JS event loop (ASYNCIFY emscripten_sleep).
 *   3. A real frame reaches the canvas (screenshot saved for visual inspection).
 *   4. Frames advance over time (two screenshots differ) when input is sent.
 *
 * Usage: npx tsx tools/gzrender-v2/test-interactive-play.mts [map]
 * Requires: npm run dev (5150), npm run build:gzdoom-wasm
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const MAP = process.argv[2] ?? 'E1M1';
const IWAD = MAP.startsWith('MAP') ? '/wads/DOOM2.WAD' : '/wads/DOOM.WAD';
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2/interactive');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const logs: string[] = [];
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
    await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });

    const url = `${BASE}/gzdoom-oracle.html?play=${encodeURIComponent(MAP)}&iwad=${encodeURIComponent(IWAD)}&_=${Date.now()}`;
    console.log(`Navigating: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 });

    // Engine started (callMain returned at first ASYNCIFY yield).
    await page.waitForFunction(
      () => window.__gzdoomOracleCapture?.done === true || window.__gzdoomOracleCapture?.error != null,
      { timeout: 180_000, polling: 500 },
    );
    const cap = await page.evaluate(() => window.__gzdoomOracleCapture);
    if (cap?.error) {
      throw new Error(`Interactive start failed: ${cap.error}\nLogs:\n${logs.slice(-40).join('\n')}`);
    }
    console.log(`Engine started: ${cap?.status}`);

    // RESPONSIVENESS PROBE — if the loop did not yield, these round-trips would hang.
    const t0 = await page.evaluate(() => performance.now());
    await sleep(1500);
    const t1 = await page.evaluate(() => performance.now());
    console.log(`Responsive: page evaluate round-tripped while engine running (dt=${Math.round(t1 - t0)}ms)`);

    await sleep(1500);
    const shot1 = path.join(OUT_DIR, `${MAP}-frame1.png`);
    await page.screenshot({ path: shot1, clip: { x: 0, y: 0, width: 640, height: 480 } });

    if (process.env.NOINPUT === '1') {
      // Burst-capture to see the presentation pattern over time (level vs black flicker).
      for (let i = 0; i < 12; i++) {
        await sleep(400);
        const p = path.join(OUT_DIR, `${MAP}-burst-${String(i).padStart(2, '0')}.png`);
        await page.screenshot({ path: p, clip: { x: 165, y: 218, width: 320, height: 200 } });
        const black = await page.evaluate(() => {
          const c = document.getElementById('canvas') as HTMLCanvasElement | null;
          if (!c) return 'no-canvas';
          const gl = c.getContext('webgl2');
          if (!gl) return 'no-gl';
          const px = new Uint8Array(4);
          gl.readPixels(c.width >> 1, c.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return `center=${px[0]},${px[1]},${px[2]}`;
        });
        console.log(`burst ${i}: ${black}`);
      }
      fs.writeFileSync(path.join(OUT_DIR, `${MAP}-console.log`), logs.join('\n'));
      return;
    }

    // Send movement input (Stage B wires real input; this also probes responsiveness).
    await page.evaluate(() => {
      const c = document.getElementById('canvas') as HTMLCanvasElement | null;
      c?.focus();
      c?.click();
    });
    await page.keyboard.down('w');
    await sleep(1200);
    await page.keyboard.up('w');
    await sleep(400);
    const shot2 = path.join(OUT_DIR, `${MAP}-frame2.png`);
    await page.screenshot({ path: shot2, clip: { x: 0, y: 0, width: 640, height: 480 } });

    const a = fs.readFileSync(shot1);
    const b = fs.readFileSync(shot2);
    const differ = a.length !== b.length || !a.equals(b);
    console.log(`Frame1: ${shot1}`);
    console.log(`Frame2: ${shot2}`);
    console.log(`Frames differ after input: ${differ ? 'YES (motion/animation present)' : 'no (static)'}`);

    fs.writeFileSync(path.join(OUT_DIR, `${MAP}-console.log`), logs.join('\n'));
    console.log(`Console log: ${path.join(OUT_DIR, `${MAP}-console.log`)} (${logs.length} lines)`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
