#!/usr/bin/env tsx
import puppeteer from 'puppeteer';
import { diffPlayfieldPngFiles, formatFrameDiff } from '../../src/wad/parity/frame/frameDiff.ts';
import { waitClassicPlaying } from './waitClassicPlaying.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:5150';
const OUT = 'artifacts/gzrender-v2/parity-compare';

async function captureClassic(page: puppeteer.Page, extraQuery: string): Promise<Buffer> {
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?renderer=classic&frameParity=1&map=E1M1&${extraQuery}&_=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await waitClassicPlaying(page);
  await new Promise((r) => setTimeout(r, 2000));
  const dataUrl = await page.evaluate(function () {
    const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    const glSource = (canvas as unknown as { __doomGlCanvas?: HTMLCanvasElement })?.__doomGlCanvas ?? canvas;
    const gl = glSource?.getContext('webgl2', { preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl || !glSource) return null;
    gl.flush();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = ((h - 1 - y) * w + x) * 4;
        const dst = (y * w + x) * 4;
        image.data[dst] = buf[src]!;
        image.data[dst + 1] = buf[src + 1]!;
        image.data[dst + 2] = buf[src + 2]!;
        image.data[dst + 3] = buf[src + 3]!;
      }
    }
    ctx.putImageData(image, 0, 0);
    return out.toDataURL('image/png');
  });
  if (!dataUrl) throw new Error('capture failed');
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

async function main(): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  const goldRef = `${OUT}/../gold-standard/DOOM/E1M1/ref.png`;
  const goldWasm = `${OUT}/../gold-standard/DOOM/E1M1/ref-wasm.png`;
  for (const mode of ['gpu', 'software'] as const) {
    const extra = mode === 'software' ? 'softwareParity=1' : '';
    const png = await captureClassic(page, extra);
    const path = `${OUT}/E1M1-classic-${mode}.png`;
    await import('node:fs/promises').then((fs) => fs.writeFile(path, png));
    for (const [label, ref] of [
      ['modular-img', `${OUT}/E1M1-modular-spawn.png`],
      ['ref.png', goldRef],
      ['ref-wasm.png', goldWasm],
    ] as const) {
      const diff = await diffPlayfieldPngFiles(path, ref, {
        tolerance: 8,
        layout: 'gzdoom-view',
      });
      console.log(`${mode} vs ${label}: ${formatFrameDiff(diff)}`);
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
