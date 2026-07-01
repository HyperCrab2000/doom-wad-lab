#!/usr/bin/env npx tsx
/**
 * Capture GZDoom WASM GZDRAW v1 draw-list oracle (Tier 2 parity).
 *
 * Architecture (Puppeteer is the WebGL2 host, NOT the draw-list source):
 *   1. gold `gzdoom.gzstate` → identical spawn state as native gold capture
 *   2. WASM `-gzdraw_dump` → C++ HW draw-list → MEMFS `.gzdraw` (canonical)
 *   3. Puppeteer only loads WASM in headless Chrome and reads MEMFS bytes out
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/capture-gzdoom-wasm-gzdraw.mts [map] [view] [probeId] [out.gzdraw]
 *
 *   view: optional x,y,yaw or x,y,yaw,pitch (map units + degrees)
 *   probeId: optional view-probe id (default 0 = spawn); used to resolve view when omitted
 *
 * Requires: npm run dev (5150), npm run build:gzdoom-wasm
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { GZDRAW_MAGIC } from '../../src/wad/parity/gzdraw/constants.ts';
import { enumerateViewProbesForMap } from './enumerate-view-probes.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE = process.env.TEST_URL ?? 'http://localhost:5150';
const MAP = (process.argv[2] ?? 'E1M1').toUpperCase();
const VIEW_ARG = process.argv[3];
const PROBE_ARG = process.argv[4];
const OUT_ARG = process.argv[5];

const IWAD = MAP.startsWith('MAP') ? '/wads/DOOM2.WAD' : '/wads/DOOM.WAD';
const GOLD_SLUG = MAP.startsWith('MAP') ? 'DOOM2' : 'DOOM';
const WAD_NAME = MAP.startsWith('MAP') ? 'DOOM2.WAD' : 'DOOM.WAD';
const GOLD_GZSTATE = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard', GOLD_SLUG, MAP, 'gzdoom.gzstate');

function parseProbeId(raw: string | undefined): number {
  if (raw == null || raw === '') return 0;
  if (/\.gzdraw$/i.test(raw)) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid probeId: ${raw}`);
  }
  return n;
}

function resolveView(viewArg: string | undefined, probeId: number): string {
  if (viewArg && !/^\d+$/.test(viewArg) && viewArg.includes(',')) {
    return viewArg;
  }
  const probes = enumerateViewProbesForMap(WAD_NAME, MAP);
  const probe = probes.find((p) => p.probeId === probeId);
  if (!probe) {
    throw new Error(`No view probe ${probeId} for ${MAP} in ${WAD_NAME}`);
  }
  return `${probe.viewX},${probe.viewY},${probe.yawDeg}`;
}

function resolveOutPath(viewArg: string | undefined, probeArg: string | undefined, outArg: string | undefined): string {
  if (outArg) return path.resolve(outArg);
  if (probeArg && /\.gzdraw$/i.test(probeArg)) return path.resolve(probeArg);
  if (viewArg && /\.gzdraw$/i.test(viewArg)) return path.resolve(viewArg);
  const probeId = parseProbeId(probeArg ?? (viewArg && /^\d+$/.test(viewArg) ? viewArg : undefined));
  return path.join(ROOT, 'artifacts/gzrender-v2/gzdraw', GOLD_SLUG, MAP, `probe-${probeId}.gzdraw`);
}

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

  if (!fs.existsSync(GOLD_GZSTATE)) {
    console.error(`Missing gold gzstate: ${GOLD_GZSTATE}`);
    process.exit(2);
  }

  const probeId = parseProbeId(
    PROBE_ARG && !/\.gzdraw$/i.test(PROBE_ARG)
      ? PROBE_ARG
      : VIEW_ARG && /^\d+$/.test(VIEW_ARG)
        ? VIEW_ARG
        : undefined,
  );
  const view = resolveView(VIEW_ARG && !/^\d+$/.test(VIEW_ARG) ? VIEW_ARG : undefined, probeId);
  const OUT = resolveOutPath(VIEW_ARG, PROBE_ARG, OUT_ARG);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-features=SharedArrayBuffer'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });

  const logs: string[] = [];
  try {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

    await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
    const gzBytes = fs.readFileSync(GOLD_GZSTATE);
    await page.evaluateOnNewDocument((name, bytes) => {
      window.__gzdoomOracleGzstate = { name, bytes: Uint8Array.from(bytes) };
    }, `${MAP}.gzstate`, [...gzBytes]);

    const url = new URL(`${BASE}/gzdoom-oracle.html`);
    url.searchParams.set('capture', MAP);
    url.searchParams.set('iwad', IWAD);
    url.searchParams.set('gzdraw', '1');
    url.searchParams.set('view', view);
    url.searchParams.set('probeId', String(probeId));
    url.searchParams.set('_', String(Date.now()));

    console.log(`Navigating: ${url.toString()}`);
    console.log(`  view: probe-${probeId} = ${view}`);
    await page.goto(url.toString(), { waitUntil: 'load', timeout: 180_000 });

    await page.waitForFunction(
      () => window.__gzdoomOracleCapture?.done === true || window.__gzdoomOracleCapture?.error != null,
      { timeout: 180_000, polling: 500 },
    );

    const capture = await page.evaluate(() => window.__gzdoomOracleCapture);
    const gzdrawBytesEarly = await page.evaluate(() => window.__gzdoomOracleCapture?.gzdrawBytes);
    const stdioNoise =
      capture?.error?.includes('stdio streams had content') ||
      capture?.error?.includes('not flushed');
    if (capture?.error && !(stdioNoise && gzdrawBytesEarly?.length)) {
      throw new Error(`GZDoom WASM GZDRAW capture failed: ${capture.error}\nLogs:\n${logs.slice(-30).join('\n')}`);
    }

    const gzdrawBytes = gzdrawBytesEarly;
    if (!gzdrawBytes?.length) {
      throw new Error(`No MEMFS GZDRAW bytes (gzdrawBytes=${gzdrawBytes?.length ?? 0})`);
    }

    const buf = Buffer.from(gzdrawBytes);
    const magic = buf.readUInt32LE(0);
    if (magic !== GZDRAW_MAGIC) {
      throw new Error(
        `Invalid GZDRAW magic 0x${magic.toString(16)} (expected 0x${GZDRAW_MAGIC.toString(16)})`,
      );
    }

    fs.writeFileSync(OUT, buf);
    console.log(`GZDoom WASM gzdraw: ${OUT} (${buf.length} bytes)`);
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
