import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';

async function snap(stage) {
  const url = `${BASE}/?renderer=pathtrace&ptStage=${stage}`;
  const browser = await puppeteer.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  await page.waitForFunction(
    () =>
      document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') === 'ready' &&
      document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 90000 }
  );
  await new Promise((r) => setTimeout(r, 3000));
  const hud = await page.$eval('.path-trace-hud', (el) => el.textContent).catch(() => '');
  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas');
    if (!canvas) return null;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) return null;
    const w = canvas.width;
    const h = canvas.height;
    let magenta = 0;
    let greenish = 0;
    let nonBlack = 0;
    const samples = 40;
    for (let i = 0; i < samples; i++) {
      const x = Math.floor((i / (samples - 1)) * (w - 1));
      const y = Math.floor(h / 2);
      const buf = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const [r, g, b] = buf;
      if (r > 200 && g < 50 && b > 200) magenta++;
      if (g > 180 && r < 120) greenish++;
      if (r + g + b > 30) nonBlack++;
    }
    return { magenta, greenish, nonBlack, w, h };
  });
  await browser.close();
  return { stage, hud, pixels };
}

const stages = ['wireframe', 'mesh', 'flats', 'walls', 'full'];
(async () => {
  console.log('Checking modular stages...\n');
  for (const stage of stages) {
    try {
      const r = await snap(stage);
      console.log(JSON.stringify(r, null, 2));
    } catch (e) {
      console.log(stage, 'FAIL', e instanceof Error ? e.message : e);
    }
  }
})();
