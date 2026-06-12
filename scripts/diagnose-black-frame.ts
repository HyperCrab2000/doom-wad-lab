import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 5000));

  const report = await page.evaluate(() => {
    const game = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    const gl = game?.getContext('webgl2');
    const samples: number[][] = [];
    if (gl && game && game.width > 0 && game.height > 0) {
      for (const [x, y] of [
        [game.width >> 1, game.height >> 1],
        [game.width >> 2, game.height >> 2],
        [(game.width * 3) >> 2, game.height >> 1],
        [game.width >> 1, game.height >> 3],
      ]) {
        const p = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        samples.push(Array.from(p));
      }
    }

    const canvasStyle = game ? getComputedStyle(game) : null;
    const overlay = document.querySelector('.doom-level-transition--active');
    const idle = document.querySelector('.renderer-idle');
    const err = document.querySelector('.renderer-error');

    return {
      fps: document.getElementById('fps-counter')?.textContent ?? null,
      playing: document.querySelector('.level-viewer')?.getAttribute('data-is-playing'),
      mapState: document.querySelector('.level-viewer')?.getAttribute('data-map-load-state'),
      gameSize: game ? [game.width, game.height] : null,
      clientSize: game ? [game.clientWidth, game.clientHeight] : null,
      canvasVisibility: canvasStyle?.visibility,
      canvasOpacity: canvasStyle?.opacity,
      canvasDisplay: canvasStyle?.display,
      canvasZ: canvasStyle?.zIndex,
      transitionActive: !!overlay,
      idleVisible: !!idle,
      errorText: err?.textContent ?? null,
      hud: !!document.querySelector('canvas.doom-hud'),
      samples,
    };
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();

  const center = report.samples[0];
  if (!center || (center[0] === 0 && center[1] === 0 && center[2] === 0)) {
    console.error('FAIL: center pixel black while FPS live');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
