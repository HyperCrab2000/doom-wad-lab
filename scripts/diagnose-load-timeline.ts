import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';

async function readState(page: import('puppeteer').Page) {
  return page.evaluate(() => {
    const game = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    const viewer = document.querySelector('.level-viewer');
    const gl = game?.getContext('webgl2');
    let gamePixel: number[] | null = null;
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
      gamePixel = Array.from(p);
    }
    return {
      t: Date.now(),
      transitionPhase: viewer?.getAttribute('data-transition-phase') ?? null,
      mapLoadState: viewer?.getAttribute('data-map-load-state') ?? null,
      isPlaying: viewer?.getAttribute('data-is-playing') === 'true',
      transitionActive: document.querySelector('.doom-level-transition--active') != null,
      hud: document.querySelector('canvas.doom-hud') != null,
      fps: document.getElementById('fps-counter')?.textContent ?? null,
      gameSize: game ? [game.width, game.height] : null,
      gamePixel,
    };
  });
}

function isBlack(pixel: number[] | null) {
  return pixel == null || (pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0);
}

async function main() {
  const errors: string[] = [];
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));

  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');

  const timeline: Awaited<ReturnType<typeof readState>>[] = [];
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 100));
    timeline.push(await readState(page));
  }

  const firstNonBlack = timeline.findIndex((s) => !isBlack(s.gamePixel));
  const lastNonBlack = [...timeline].reverse().findIndex((s) => !isBlack(s.gamePixel));
  const lastNonBlackIdx = lastNonBlack >= 0 ? timeline.length - 1 - lastNonBlack : -1;
  const wentBlackAgain =
    firstNonBlack >= 0 &&
    lastNonBlackIdx >= 0 &&
    timeline.slice(lastNonBlackIdx + 1).some((s) => isBlack(s.gamePixel) && s.isPlaying);

  console.log(
    JSON.stringify(
      {
        errors,
        firstNonBlackAt100ms: firstNonBlack,
        lastNonBlackAt100ms: lastNonBlackIdx,
        wentBlackAgain,
        samples: timeline.filter((_, i) => i % 5 === 0 || i === timeline.length - 1),
        final: timeline[timeline.length - 1],
      },
      null,
      2
    )
  );

  await browser.close();

  if (errors.length > 0) {
    console.error('FAIL: errors', errors);
    process.exit(1);
  }
  if (wentBlackAgain) {
    console.error('FAIL: screen went black again after rendering');
    process.exit(1);
  }
  if (isBlack(timeline[timeline.length - 1]?.gamePixel ?? null)) {
    console.error('FAIL: ended black');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
