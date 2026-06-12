/**
 * Verify committed baseline: map loads, GL has pixels, screenshot saved for inspection.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createCanvas, loadImage } from 'canvas';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150/';
const OUT = path.join(process.cwd(), 'tmp-baseline-verify');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  let final: Record<string, unknown> | null = null;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    final = await page.evaluate(() => {
      const fps = document.getElementById('fps-counter')?.textContent ?? '';
      const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
      const gl = canvas?.getContext('webgl2');
      let readCenter: number[] | null = null;
      if (gl && canvas && canvas.width > 0) {
        const p = new Uint8Array(4);
        gl.readPixels(canvas.width >> 1, canvas.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        readCenter = Array.from(p);
      }
      return {
        fps,
        hud: !!document.querySelector('.doom-hud'),
        transition: document.querySelector('.doom-level-transition')?.className ?? null,
        loader: document.body.innerText.includes('building map geometry'),
        readCenter,
        canvasClass: canvas?.className ?? null,
      };
    });
    console.log(`${i * 2}s`, JSON.stringify(final));
    if (
      final?.fps &&
      String(final.fps).includes('(') &&
      final.readCenter &&
      (final.readCenter[0] as number) > 8
    ) {
      break;
    }
  }

  const canvasEl = await page.$('.game-canvas');
  if (canvasEl) {
    fs.writeFileSync(path.join(OUT, 'game-canvas.png'), await canvasEl.screenshot());
  }
  const vpEl = await page.$('.game-card__viewport');
  if (vpEl) {
    fs.writeFileSync(path.join(OUT, 'viewport.png'), await vpEl.screenshot());
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(final, null, 2));

  if (fs.existsSync(path.join(OUT, 'game-canvas.png'))) {
    const img = await loadImage(path.join(OUT, 'game-canvas.png'));
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const center = ctx.getImageData(img.width >> 1, img.height >> 1, 1, 1).data;
    console.log('screenshot center', Array.from(center));
  }

  await browser.close();

  const read = final?.readCenter as number[] | undefined;
  if (!read || read[0]! <= 8) {
    console.error('FAIL: GL buffer still black');
    process.exit(1);
  }
  console.log('PASS: baseline GL draws geometry');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
