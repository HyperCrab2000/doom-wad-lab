#!/usr/bin/env npx tsx
/**
 * Stage 1 verification — renderer-only GZDoom core driven by the host.
 *
 * Proves: (1) the renderer-only mode (-gzrender_hosted, sim frozen) fills 640x480 (not boxed),
 * (2) renders from host-injected GZSTATE with no magenta (it's GZDoom, not the TS renderer),
 * (3) the host can move the camera via gzr_set_view() and the rendered frame responds.
 *
 * Usage: npx tsx tools/gzrender-v2/test-renderer-core.mts [map]
 */
import puppeteer, { type Page } from 'puppeteer';

const MAP = process.argv[2] ?? 'E1M1';
const IWAD = MAP.startsWith('MAP') ? '/wads/DOOM2.WAD' : '/wads/DOOM.WAD';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Read { w: number; h: number; fill: number; magenta: number; sig: number }

async function readBuf(page: Page): Promise<Read | { error: string }> {
  return page.evaluate(() => {
    const c = document.querySelector('#canvas') as HTMLCanvasElement | null;
    const gl = c?.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return { error: 'no gl' };
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let nonBlack = 0;
    let magenta = 0;
    let sig = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]!;
      const g = px[i + 1]!;
      const bl = px[i + 2]!;
      if (r + g + bl > 24) nonBlack++;
      if (r > 200 && g < 60 && bl > 200) magenta++;
      if (i % (4 * 64) === 0) sig = (sig * 31 + r + g + bl) >>> 0;
    }
    return { w, h, fill: nonBlack / (w * h), magenta, sig };
  });
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
  channel: 'chrome',
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  const orig = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, id: string, attrs?: unknown) => unknown;
  HTMLCanvasElement.prototype.getContext = function (id: string, attrs?: Record<string, unknown>) {
    if (id === 'webgl2' || id === 'webgl') attrs = { ...(attrs ?? {}), preserveDrawingBuffer: true };
    return orig.call(this, id, attrs);
  } as typeof orig;
});
await page.setViewport({ width: 800, height: 600 });
await page.goto(`http://localhost:5150/gzdoom-oracle.html?hosted=${MAP}&iwad=${encodeURIComponent(IWAD)}&_=${Date.now()}`, {
  waitUntil: 'load',
  timeout: 180000,
});
await page.waitForFunction(() => window.__gzdoomOracleCapture?.done === true || window.__gzdoomOracleCapture?.error != null, {
  timeout: 180000,
  polling: 500,
});
const cap = await page.evaluate(() => window.__gzdoomOracleCapture);
if (cap?.error) {
  console.log(`FAIL: ${cap.error}`);
  await browser.close();
  process.exit(1);
}
await sleep(1500);

const a = await readBuf(page);
if ('error' in a) {
  console.log(`FAIL: ${a.error}`);
  await browser.close();
  process.exit(1);
}
console.log(`renderer-only: buffer=${a.w}x${a.h} fill=${a.fill.toFixed(3)} magenta=${a.magenta}`);

// Read current view from the camera start, then turn the camera 180° via gzr_set_view.
const moved = await page.evaluate((map: string) => {
  const m = (window as unknown as { __gzHostedModule?: { _gzr_set_view?: (x: number, y: number, yaw: number, pitch: number) => void } }).__gzHostedModule;
  if (!m?._gzr_set_view) return false;
  // Doom E1M1 player start ~ (1056, -3616) angle 90; just sweep yaw to force a different view.
  void map;
  m._gzr_set_view(1056, -3616, 270, 0);
  return true;
}, MAP);
await sleep(1200);
const b = await readBuf(page);
if ('error' in b) {
  console.log(`FAIL: ${b.error}`);
  await browser.close();
  process.exit(1);
}
const changed = a.sig !== b.sig;
console.log(`gzr_set_view applied=${moved} frame changed=${changed} (sigA=${a.sig} sigB=${b.sig})`);

let ok = true;
if (a.w !== 640 || a.h !== 480) { console.log(`  FAIL: buffer not 640x480 (${a.w}x${a.h})`); ok = false; }
if (a.fill < 0.5) { console.log(`  FAIL: not filling (${(a.fill * 100).toFixed(1)}%) — still boxed`); ok = false; }
if (a.magenta > 0) { console.log(`  FAIL: magenta present (TS renderer)`); ok = false; }
if (!moved) { console.log(`  FAIL: gzr_set_view export missing`); ok = false; }
if (!changed) { console.log(`  FAIL: camera move did not change the frame`); ok = false; }
console.log(`\n=== RESULT: ${ok ? 'PASS' : 'FAIL'} ===`);
await browser.close();
process.exit(ok ? 0 : 1);
