#!/usr/bin/env npx tsx
import puppeteer from 'puppeteer';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const logs: string[] = [];
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], channel: 'chrome' });
  const page = await browser.newPage();
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:5150/?renderer=gzdoom-wasm&_=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await sleep(90000);
  const s = await page.evaluate(() => {
    const c = document.querySelector('canvas.gzdoom-wasm-play-canvas') as HTMLCanvasElement | null;
    let pixel: number[] | null = null;
    if (c) {
      const gl = c.getContext('webgl2');
      if (gl) {
        const px = new Uint8Array(4);
        gl.readPixels(c.width >> 1, (c.height >> 1) - 40, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        pixel = [px[0]!, px[1]!, px[2]!];
      }
    }
    return {
      viewer: !!document.querySelector('.level-viewer'),
      playState: document.querySelector('.level-viewer')?.getAttribute('data-classic-play-state'),
      canvas: !!c,
      pixel,
      rootLen: document.getElementById('root')?.innerHTML.length ?? 0,
    };
  });
  console.log(JSON.stringify(s, null, 2));
  console.log('pageerrors', logs.filter((l) => l.startsWith('[pageerror]')));
  await browser.close();
}
main();
