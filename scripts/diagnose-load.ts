import puppeteer from 'puppeteer';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';

async function selectDoomE1M1(page: import('puppeteer').Page) {
  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  await page.waitForFunction(
    () => {
      const map = document.querySelectorAll('.level-toolbar select')[1] as HTMLSelectElement | undefined;
      return map && !map.disabled && Array.from(map.options).some((o) => o.value === 'E1M1');
    },
    { timeout: 120000 }
  );
  const mapSelect = (await page.$$('select'))[1];
  if (!mapSelect) throw new Error('Map select not found');
  await mapSelect.select('E1M1');
}

async function readState(page: import('puppeteer').Page) {
  return page.evaluate(() => {
    const game = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    const overlay = document.querySelector('.doom-level-transition__overlay') as HTMLCanvasElement | null;
    const viewer = document.querySelector('.level-viewer');
    const gl = game?.getContext('webgl2');
    let gamePixel: number[] | null = null;
    let overlayPixel: number[] | null = null;
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
    const octx = overlay?.getContext('2d', { willReadFrequently: true });
    if (octx && overlay && overlay.width > 0 && overlay.height > 0) {
      const d = octx.getImageData(
        Math.floor(overlay.width / 2),
        Math.floor(overlay.height / 2),
        1,
        1
      ).data;
      overlayPixel = Array.from(d);
    }
    const fps = document.getElementById('fps-counter')?.textContent ?? null;
    return {
      mapLoadState: viewer?.getAttribute('data-map-load-state') ?? null,
      isPlaying: viewer?.getAttribute('data-is-playing') === 'true',
      intermission: viewer?.getAttribute('data-intermission') === 'true',
      transitionActive: document.querySelector('.doom-level-transition--active') != null,
      hud: document.querySelector('canvas.doom-hud') != null,
      fps,
      fpsLive: fps != null && fps.includes('('),
      gameSize: game ? [game.width, game.height] : null,
      overlaySize: overlay ? [overlay.width, overlay.height] : null,
      gamePixel,
      overlayPixel,
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
  await page.setViewport({ width: 1280, height: 900 });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await selectDoomE1M1(page);

  const timeline: Awaited<ReturnType<typeof readState>>[] = [];
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 100));
    timeline.push(await readState(page));
  }

  const finalState = timeline[timeline.length - 1]!;
  const readyBlackStuck = timeline.filter(
    (s) => s.mapLoadState === 'ready' && isBlack(s.gamePixel)
  ).length;
  const readyNoHudStuck = timeline.filter(
    (s) => s.mapLoadState === 'ready' && !s.hud
  ).length;

  console.log(
    JSON.stringify(
      {
        errors,
        readyBlackSamples: readyBlackStuck,
        readyNoHudSamples: readyNoHudStuck,
        timeline: timeline.filter((_, i) => i % 10 === 0 || i === timeline.length - 1),
        finalState,
      },
      null,
      2
    )
  );

  await browser.close();

  if (errors.length > 0) {
    console.error('FAIL: console errors');
    process.exit(1);
  }
  if (finalState.mapLoadState !== 'ready') {
    console.error('FAIL: map never reached ready');
    process.exit(1);
  }
  if (!finalState.isPlaying) {
    console.error('FAIL: not in playing state while map ready');
    process.exit(1);
  }
  if (!finalState.hud) {
    console.error('FAIL: HUD never appeared');
    process.exit(1);
  }
  if (!finalState.fpsLive) {
    console.error('FAIL: render loop not running (FPS counter stuck)');
    process.exit(1);
  }
  if (isBlack(finalState.gamePixel)) {
    console.error('FAIL: game canvas is black while playing');
    process.exit(1);
  }
  if (readyBlackStuck > 20) {
    console.error(`FAIL: canvas stayed black for ${readyBlackStuck * 100}ms after map ready`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
