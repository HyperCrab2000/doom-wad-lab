import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:4174';

async function main() {
  const errors: string[] = [];
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));

  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.level-toolbar select', { timeout: 60000 });
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  await page.waitForFunction(
    () => document.getElementById('fps-counter')?.textContent?.includes('FPS:'),
    { timeout: 120000 }
  );
  await page.waitForFunction(
    () => {
      const fps = document.getElementById('fps-counter')?.textContent ?? '';
      return fps.includes('ms)') && document.querySelector('.doom-level-transition--active') == null;
    },
    { timeout: 120000 }
  );
  await new Promise((r) => setTimeout(r, 1000));

  const info = await page.evaluate(() => {
    const game = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    const hud = document.querySelector('canvas.doom-hud') as HTMLCanvasElement | null;
    const gl = game?.getContext('webgl2');
    let pixel: number[] | null = null;
    if (gl && game && game.width > 0) {
      const p = new Uint8Array(4);
      gl.readPixels(
        Math.floor(game.width / 2),
        Math.floor(game.height / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        p
      );
      pixel = Array.from(p);
    }
    let hudBottom: number[] | null = null;
    const hudCtx = hud?.getContext('2d');
    if (hudCtx && hud && hud.height > 0) {
      const d = hudCtx.getImageData(Math.floor(hud.width / 2), hud.height - 2, 1, 1).data;
      hudBottom = Array.from(d);
    }
    return {
      gameSize: game ? [game.width, game.height] : null,
      hudSize: hud ? [hud.width, hud.height] : null,
      pixel,
      hudBottom,
      fps: document.getElementById('fps-counter')?.textContent ?? null,
      levelViewerClass: document.querySelector('.level-viewer')?.className ?? null,
      transitionActive: document.querySelector('.doom-level-transition--active') != null,
    };
  });

  console.log(JSON.stringify({ errors, info }, null, 2));

  const black =
    info.pixel == null || (info.pixel[0] === 0 && info.pixel[1] === 0 && info.pixel[2] === 0);
  if (black) {
    console.error('FAIL: game canvas center pixel is black');
    process.exit(1);
  }
  if (errors.length > 0) {
    console.error(`FAIL: ${errors.length} console error(s)`);
    process.exit(1);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
