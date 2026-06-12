import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') === 'ready',
    { timeout: 120000 }
  );
  await new Promise((r) => setTimeout(r, 3000));

  const report = await page.evaluate(() => {
    const game = document.querySelector('.game-canvas') as HTMLCanvasElement;
    const hud = document.querySelector('canvas.doom-hud') as HTMLCanvasElement | null;
    const gl = game.getContext('webgl2');
    const glRead = new Uint8Array(4);
    gl!.readPixels(game.width >> 1, game.height >> 1, 1, 1, gl!.RGBA, gl!.UNSIGNED_BYTE, glRead);

    const probe = document.createElement('canvas');
    probe.width = game.width;
    probe.height = game.height;
    const ctx = probe.getContext('2d')!;
    ctx.drawImage(game, 0, 0);
    const drawImagePx = ctx.getImageData(game.width >> 1, game.height >> 1, 1, 1).data;

    let hudPx: number[] | null = null;
    if (hud && hud.width > 0) {
      const hctx = hud.getContext('2d');
      if (hctx) {
        hudPx = Array.from(
          hctx.getImageData(Math.floor(hud.width / 2), Math.floor(hud.height / 2), 1, 1).data
        );
      }
    }

    const style = getComputedStyle(game);
    return {
      glRead: Array.from(glRead),
      drawImage: Array.from(drawImagePx),
      hudPx,
      hudSize: hud ? [hud.width, hud.height, hud.clientWidth, hud.clientHeight] : null,
      gameSize: [game.width, game.height, game.clientWidth, game.clientHeight],
      visibility: style.visibility,
      opacity: style.opacity,
      display: style.display,
    };
  });

  console.log(JSON.stringify(report, null, 2));
  await page.screenshot({ path: 'tmp-e1m1-verify/display-probe.png' });
  await browser.close();

  const glNonBlack =
    report.glRead[0]! > 8 || report.glRead[1]! > 8 || report.glRead[2]! > 8;
  const displayNonBlack =
    report.drawImage[0]! > 8 || report.drawImage[1]! > 8 || report.drawImage[2]! > 8;

  if (glNonBlack && !displayNonBlack) {
    console.error('FAIL: WebGL buffer has content but canvas bitmap is black (display bug)');
    process.exit(1);
  }
  if (!displayNonBlack) {
    console.error('FAIL: canvas bitmap is black');
    process.exit(1);
  }
  console.log('PASS: canvas bitmap matches visible content');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
