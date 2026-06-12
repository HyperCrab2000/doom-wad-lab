/**
 * Diagnose what the user actually sees: stack, overlays, GL vs screenshot.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5152';
const OUT = path.join(process.cwd(), 'tmp-visible-game');

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

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const snap = await page.evaluate(() => {
      const vp = document.querySelector('.game-card__viewport');
      const r = vp?.getBoundingClientRect();
      if (!r) return { phase: 'no-viewport' };
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const display = document.querySelector('.game-display') as HTMLCanvasElement | null;
      const anchor = document.querySelector('.game-canvas');
      const game = display || anchor;
      const glSource =
        (anchor as HTMLCanvasElement & { __doomGlCanvas?: HTMLCanvasElement })?.__doomGlCanvas ||
        anchor;
      const gl = glSource?.getContext('webgl2');
      let readCenter: number[] | null = null;
      if (gl && glSource && glSource.width > 0) {
        const p = new Uint8Array(4);
        gl.readPixels(
          glSource.width >> 1,
          glSource.height >> 1,
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          p
        );
        readCenter = Array.from(p);
      }
      let displayCenter: number[] | null = null;
      if (display && display.width > 0) {
        const ctx = display.getContext('2d');
        if (ctx) {
          const p = ctx.getImageData(display.width >> 1, display.height >> 1, 1, 1).data;
          displayCenter = Array.from(p);
        }
      }
      const chain: string[] = [];
      let n: Element | null = top;
      while (n && n !== document.body) {
        const s = getComputedStyle(n);
        chain.push(
          `${n.tagName}.${(n as HTMLElement).className || '-'} z=${s.zIndex} op=${s.opacity} vis=${s.visibility}`
        );
        n = n.parentElement;
      }
      return {
        fps: document.getElementById('fps-counter')?.textContent ?? null,
        transition: document.querySelector('.doom-level-transition')?.className ?? null,
        hud: !!document.querySelector('.doom-hud-wrap'),
        game: game
          ? {
              w: game.width,
              h: game.height,
              css: [game.getBoundingClientRect().width, game.getBoundingClientRect().height],
              className: game.className,
            }
          : null,
        readCenter,
        displayCenter,
        topAtCenter: top ? `${top.tagName}.${(top as HTMLElement).className}` : null,
        chain,
      };
    });
    console.log(`${i * 2}s`, JSON.stringify(snap));
    if (
      snap.hud &&
      snap.readCenter &&
      snap.displayCenter &&
      (snap.readCenter[0]! > 8 || snap.readCenter[1]! > 8) &&
      (snap.displayCenter[0]! > 8 || snap.displayCenter[1]! > 8)
    ) {
      const gameEl = (await page.$('.game-display')) ?? (await page.$('.game-canvas'));
      if (gameEl) {
        const shot = await gameEl.screenshot();
        fs.writeFileSync(path.join(OUT, 'game-canvas-screenshot.png'), shot);
      }
      const vpEl = await page.$('.game-card__viewport');
      if (vpEl) {
        const shot = await vpEl.screenshot();
        fs.writeFileSync(path.join(OUT, 'viewport-screenshot.png'), shot);
      }
      fs.writeFileSync(path.join(OUT, 'final.json'), JSON.stringify(snap, null, 2));
      break;
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
