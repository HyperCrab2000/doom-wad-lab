import puppeteer from 'puppeteer';

async function sampleScreenshot(el: puppeteer.ElementHandle<Element>): Promise<number[]> {
  const buf = (await el.screenshot({ encoding: 'binary' })) as Buffer;
  const mid = Math.floor(buf.length / 2) - (Math.floor(buf.length / 2) % 4);
  return [buf[mid]!, buf[mid + 1]!, buf[mid + 2]!];
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:5150/', { waitUntil: 'domcontentloaded' });
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');

  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const hud = await page.$('.doom-hud');
    const fps = await page.$eval('#fps-counter', (el) => el.textContent ?? '');
    if (!hud || !fps.includes('(')) continue;

    const glSample = await page.evaluate(() => {
      const game = document.querySelector('.game-canvas') as HTMLCanvasElement;
      const gl = game.getContext('webgl2')!;
      const p = new Uint8Array(4);
      gl.readPixels(game.width >> 1, game.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      return Array.from(p);
    });

    const gameEl = await page.$('.game-canvas');
    const vpEl = await page.$('.game-card__viewport');
    const gamePx = gameEl ? await sampleScreenshot(gameEl) : null;
    const vpPx = vpEl ? await sampleScreenshot(vpEl) : null;

    const hudMid = await page.evaluate(() => {
      const hud = document.querySelector('.doom-hud') as HTMLCanvasElement;
      return Array.from(hud.getContext('2d')!.getImageData(hud.width >> 1, hud.height >> 1, 1, 1).data);
    });

    console.log('HUD ACTIVE', JSON.stringify({ glSample, gamePx, vpPx, hudMid: hudMid.slice(0, 4) }));
    await browser.close();
    return;
  }

  console.log('TIMEOUT: HUD never became active');
  await browser.close();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
