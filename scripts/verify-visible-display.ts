/**
 * Fails unless the visible .game-display 2D canvas shows the level (not just GL readPixels).
 */
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150/';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const sample = await page.evaluate(() => {
      const fps = document.getElementById('fps-counter')?.textContent ?? '';
      if (!fps.includes('(')) return null;
      const display = document.querySelector('.game-display') as HTMLCanvasElement | null;
      if (!display || display.width < 8) return { ok: false, reason: 'no-display' };
      const ctx = display.getContext('2d');
      if (!ctx) return { ok: false, reason: 'no-2d' };
      let black = 0;
      const grid = 8;
      for (let gy = 0; gy < grid; gy++) {
        for (let gx = 0; gx < grid; gx++) {
          const x = Math.min(display.width - 1, Math.floor(((gx + 0.5) / grid) * display.width));
          const y = Math.min(display.height - 1, Math.floor(((gy + 0.5) / grid) * display.height));
          const p = ctx.getImageData(x, y, 1, 1).data;
          if (p[0]! <= 8 && p[1]! <= 8 && p[2]! <= 8) black++;
        }
      }
      const center = ctx.getImageData(display.width >> 1, display.height >> 1, 1, 1).data;
      return {
        ok: black / (grid * grid) <= 0.45,
        blackRatio: black / (grid * grid),
        center: Array.from(center),
        hasDisplay: true,
      };
    });
    if (sample?.ok) {
      console.log('PASS visible game display', JSON.stringify(sample));
      await browser.close();
      return;
    }
    if (sample) console.log(`${i * 2}s`, JSON.stringify(sample));
  }

  console.error('FAIL: visible .game-display stayed black');
  await browser.close();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
