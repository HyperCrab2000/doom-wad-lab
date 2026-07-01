import puppeteer from 'puppeteer';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5150/?renderer=pathtrace', {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });

  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const selects = await page.$$('select');
  if (selects[1]) await selects[1].select('E1M1');

  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120000 }
  );
  await new Promise((r) => setTimeout(r, 8000));

  const info = await page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    const viewer = document.querySelector('.level-viewer');
    const hud = document.querySelector('.path-trace-hud')?.textContent ?? null;
    const viewport = document.querySelector('.game-card__viewport') as HTMLElement | null;
    const rendererSelect = document.querySelectorAll('.level-toolbar select')[2] as HTMLSelectElement | undefined;

    let pixels: number[] | null = null;
    if (canvas) {
      const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
      if (gl) {
        const buf = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        const cx = Math.floor(canvas.width / 2);
        const cy = Math.floor(canvas.height / 2);
        const i = (cy * canvas.width + cx) * 4;
        pixels = [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
      }
    }

    return {
      isPlaying: viewer?.getAttribute('data-is-playing'),
      mapLoad: viewer?.getAttribute('data-map-load-state'),
      hud,
      renderer: rendererSelect?.value,
      canvasSize: canvas ? [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight] : null,
      viewportBg: viewport ? getComputedStyle(viewport).backgroundColor : null,
      centerPixel: pixels,
    };
  });

  console.log(JSON.stringify({ info, errors: logs.filter((l) => l.includes('error') || l.includes('Path trace')) }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
