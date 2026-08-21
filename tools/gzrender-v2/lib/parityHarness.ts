import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '../../..');

export const PARITY_VIEWPORT_W = 640;
export const PARITY_VIEWPORT_H = 480;

export interface ParityCaptureServerOptions {
  baseUrl?: string;
  /** Use production preview (default) instead of Vite dev UI. */
  usePreview?: boolean;
}

let previewProc: ChildProcess | null = null;

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function isServerUp(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureParityServer(options: ParityCaptureServerOptions = {}): Promise<string> {
  const usePreview = options.usePreview !== false;
  const baseUrl = options.baseUrl ?? (usePreview ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5150');
  if (await isServerUp(baseUrl)) return baseUrl;

  if (!usePreview) {
    throw new Error(`Parity server not running at ${baseUrl}. Start preview or pass baseUrl.`);
  }

  const distIndex = path.join(ROOT, 'dist', 'parity-capture.html');
  if (!fs.existsSync(distIndex)) {
    throw new Error('Missing dist/parity-capture.html — run npm run build first.');
  }

  console.log('Starting preview server for parity capture…');
  previewProc = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  previewProc.unref();

  for (let i = 0; i < 60; i++) {
    if (await isServerUp(baseUrl)) {
      console.log(`Preview ready at ${baseUrl}`);
      return baseUrl;
    }
    await sleep(500);
  }
  throw new Error(`Preview server did not start at ${baseUrl}`);
}

export function buildParityCaptureUrl(
  baseUrl: string,
  map: string,
  options: { wadPath?: string; honest?: boolean; nativePlayfield?: boolean } = {},
): string {
  const wad = options.wadPath ?? (map.startsWith('MAP') ? '/wads/DOOM2.WAD' : '/wads/DOOM.WAD');
  const params = new URLSearchParams({
    map,
    wad,
    _: String(Date.now()),
  });
  if (options.honest !== false) params.set('honestParity', '1');
  if (options.nativePlayfield) params.set('nativePlayfield', '1');
  if (map === 'MAP31' || map === 'MAP32') params.set('softwareParity', '1');
  return `${baseUrl}/parity-capture.html?${params.toString()}`;
}

export async function launchParityBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
    protocolTimeout: 300_000,
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
}

export async function prepareParityPage(page: Page): Promise<void> {
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
  await page.setViewport({
    width: PARITY_VIEWPORT_W,
    height: PARITY_VIEWPORT_H,
    deviceScaleFactor: 1,
  });
}

export async function waitParityReady(page: Page, timeoutMs = 240_000): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __DOOM_PARITY_READY__?: boolean }).__DOOM_PARITY_READY__ === true ||
      Boolean((window as unknown as { __DOOM_PARITY_ERROR__?: string }).__DOOM_PARITY_ERROR__),
    { timeout: timeoutMs, polling: 200 },
  );
  const err = await page.evaluate(
    () => (window as unknown as { __DOOM_PARITY_ERROR__?: string }).__DOOM_PARITY_ERROR__,
  );
  if (err) throw new Error(err);
}

export async function readParityCanvasPng(page: Page): Promise<Buffer> {
  const canvas = await page.$('canvas.parity-frame');
  if (!canvas) throw new Error('parity frame canvas missing');
  const shot = await canvas.screenshot({ type: 'png' });
  return Buffer.from(shot);
}

export async function captureHonestParityFrame(
  page: Page,
  baseUrl: string,
  map: string,
  wadPath?: string,
  options: { nativePlayfield?: boolean } = {},
): Promise<Buffer> {
  const url = buildParityCaptureUrl(baseUrl, map, { wadPath, honest: true, nativePlayfield: options.nativePlayfield });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitParityReady(page);
  return readParityCanvasPng(page);
}

export function stopParityPreviewServer(): void {
  if (previewProc?.pid) {
    try {
      process.kill(-previewProc.pid);
    } catch {
      /* ignore */
    }
    previewProc = null;
  }
}
