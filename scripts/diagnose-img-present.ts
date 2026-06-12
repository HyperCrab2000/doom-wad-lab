import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from 'canvas';
import puppeteer from 'puppeteer';
import { VISIBLE_PROBE_SCRIPT } from '../test/browser/puppeteerVisibleProbe';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(VISIBLE_PROBE_SCRIPT);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5150/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') === 'ready',
    { timeout: 120_000 }
  );
  await new Promise((r) => setTimeout(r, 5000));

  const d = await page.evaluate(() => {
    const img = document.querySelector('.game-display') as HTMLImageElement | null;
    const gl = document.querySelector('.game-canvas--gl') as HTMLCanvasElement | null;
    let dataUrlCenter: number[] | null = null;
    if (gl) {
      const ctx = gl.getContext('webgl2');
      if (ctx) {
        const p = new Uint8Array(4);
        ctx.readPixels(gl.width >> 1, gl.height >> 1, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, p);
        dataUrlCenter = Array.from(p);
      }
      const url = gl.toDataURL('image/jpeg', 0.9);
      const probe = document.createElement('canvas');
      probe.width = 8;
      probe.height = 8;
      const pctx = probe.getContext('2d')!;
      const image = new Image();
      // sync decode hack - can't in evaluate easily
      return {
        img: img
          ? {
              complete: img.complete,
              nw: img.naturalWidth,
              nh: img.naturalHeight,
              srcLen: img.src.length,
              rect: img.getBoundingClientRect().toJSON(),
            }
          : null,
        gl: gl
          ? { w: gl.width, h: gl.height, rect: gl.getBoundingClientRect().toJSON(), readPixelsCenter: dataUrlCenter }
          : null,
        toDataURLLen: url.length,
      };
    }
    return { img: null, gl: null };
  });

  const imgPixels = await page.evaluate(() => {
    const img = document.querySelector('.game-display') as HTMLImageElement | null;
    if (!img || !img.complete || img.naturalWidth < 1) return null;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const p = ctx.getImageData(img.naturalWidth >> 1, img.naturalHeight >> 1, 1, 1).data;
    return Array.from(p);
  });

  console.log(JSON.stringify({ ...d, imgPixelsCenter: imgPixels }, null, 2));

  const outDir = path.join(process.cwd(), 'tmp-headed-verify');
  fs.mkdirSync(outDir, { recursive: true });

  const imgEl = await page.$('.game-display');
  if (imgEl) {
    const buf = await imgEl.screenshot();
    fs.writeFileSync(path.join(outDir, 'img-shot.png'), buf);
    const b64 = buf.toString('base64');
    const shotBlack = await page.evaluate(
      (pngB64, grid) =>
        (window as unknown as { __screenshotBlackRatio: (p: string, g: number) => Promise<number> })
          .__screenshotBlackRatio(pngB64, grid),
      b64,
      10
    );
    const shot = await loadImage(buf);
    const c = createCanvas(shot.width, shot.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(shot, 0, 0);
    const center = ctx.getImageData(shot.width >> 1, shot.height >> 1, 1, 1).data;
    console.log('screenshotBlackRatio', shotBlack, 'center', Array.from(center));
  }

  await browser.close();
}

main();
