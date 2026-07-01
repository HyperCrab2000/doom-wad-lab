#!/usr/bin/env npx tsx
/**
 * Capture GZDoom WASM browser frame for Step 2 parity.
 *
 * Architecture (Puppeteer is the WebGL2 host, NOT the pixel source):
 *   1. gold `gzdoom.gzstate` → identical spawn state as native gold capture
 *   2. WASM `-gzstate_refframe` → C++ glReadPixels → MEMFS PNG (canonical)
 *   3. Puppeteer only loads WASM in headless Chrome and reads MEMFS bytes out
 *
 * Canvas screenshot is a last-resort fallback only; gate diffs must use MEMFS ref.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/capture-gzdoom-wasm-frame.mts [map] [out.png] [display-mode]
 *
 * Requires: npm run dev (5150), npm run build:gzdoom-wasm
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { parseDisplayModeId } from '../../src/gzdoom-oracle/parityDisplayModes.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const MAP = process.argv[2] ?? 'E1M1';
const OUT = process.argv[3] ?? path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm', `${MAP}.png`);
const DISPLAY_MODE = parseDisplayModeId(process.env.DISPLAY_MODE ?? process.argv[4] ?? 'full');
const IWAD = MAP.startsWith('MAP') ? '/wads/DOOM2.WAD' : '/wads/DOOM.WAD';
const GOLD_SLUG = MAP.startsWith('MAP') ? 'DOOM2' : 'DOOM';
const GOLD_GZSTATE = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard', GOLD_SLUG, MAP, 'gzdoom.gzstate');

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!(await isServerUp())) {
    console.error(`Dev server not reachable at ${BASE} — run: npm run dev`);
    process.exit(2);
  }

  const wasmPath = path.join(ROOT, 'public/wasm/gzdoom/gzdoom.wasm');
  if (!fs.existsSync(wasmPath)) {
    console.error('Missing gzdoom.wasm — run: npm run build:gzdoom-wasm');
    process.exit(2);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-features=SharedArrayBuffer',
    ],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });

  const logs: string[] = [];
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

    await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
    if (fs.existsSync(GOLD_GZSTATE)) {
      const gzBytes = fs.readFileSync(GOLD_GZSTATE);
      await page.evaluateOnNewDocument((name, bytes) => {
        window.__gzdoomOracleGzstate = { name, bytes: Uint8Array.from(bytes) };
      }, `${MAP}.gzstate`, [...gzBytes]);
    }
    const probe = process.env.GZRENDER_PROBE;
    const probeQ = probe ? `&probe=${encodeURIComponent(probe)}` : '';
    const shaderDebug = process.env.GZRENDER_SHADER_DEBUG;
    const shaderDebugQ = shaderDebug ? `&shaderDebug=${encodeURIComponent(shaderDebug)}` : '';
    const modeQ = DISPLAY_MODE !== 'full' ? `&mode=${encodeURIComponent(DISPLAY_MODE)}` : '';
    const url = `${BASE}/gzdoom-oracle.html?capture=${encodeURIComponent(MAP)}&iwad=${encodeURIComponent(IWAD)}${probeQ}${shaderDebugQ}${modeQ}&_=${Date.now()}`;
    console.log(`Navigating: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 });

    await page.waitForFunction(
      () => window.__gzdoomOracleCapture?.done === true || window.__gzdoomOracleCapture?.error != null,
      { timeout: 180_000, polling: 500 },
    );

    const capture = await page.evaluate(() => window.__gzdoomOracleCapture);
    const refBytesEarly = await page.evaluate(() => {
      const cap = window.__gzdoomOracleCapture;
      return cap?.memfsRefPngBytes ?? cap?.refPngBytes;
    });
    const stdioNoise =
      capture?.error?.includes('stdio streams had content') ||
      capture?.error?.includes('not flushed');
    if (capture?.error && !(stdioNoise && refBytesEarly?.length)) {
      throw new Error(`GZDoom WASM capture failed: ${capture.error}\nLogs:\n${logs.slice(-30).join('\n')}`);
    }

    const sizes = await page.evaluate(() => {
      const cap = window.__gzdoomOracleCapture;
      return {
        memfs: cap?.memfsRefPngBytes?.length ?? 0,
        ref: cap?.refPngBytes?.length ?? 0,
        canvas: cap?.canvasPngBytes?.length ?? 0,
      };
    });
    console.log(`Capture bytes: memfs=${sizes.memfs} ref=${sizes.ref} canvas=${sizes.canvas}`);

    const refBytes = await page.evaluate(() => {
      const cap = window.__gzdoomOracleCapture;
      return cap?.memfsRefPngBytes ?? cap?.refPngBytes;
    });
    const isPng =
      refBytes &&
      refBytes.length > 8 &&
      refBytes[0] === 0x89 &&
      refBytes[1] === 0x50 &&
      refBytes[2] === 0x4e &&
      refBytes[3] === 0x47;

    if (isPng) {
      fs.writeFileSync(OUT, Buffer.from(refBytes));
    } else {
      throw new Error(
        `No MEMFS ref PNG from -gzstate_refframe (memfs=${sizes.memfs} ref=${sizes.ref}). ` +
          'Canvas screenshot is not gate-quality; fix WASM render/capture. ' +
          `Logs: ${OUT}.log.txt`,
      );
    }
    console.log(`GZDoom WASM frame: ${OUT}`);
    if (logs.length) {
      fs.writeFileSync(`${OUT}.log.txt`, logs.join('\n'));
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
