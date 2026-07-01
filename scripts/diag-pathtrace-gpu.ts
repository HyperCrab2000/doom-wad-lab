import puppeteer from 'puppeteer';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await page.setViewport({ width: 1280, height: 900 });
  const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
  await page.goto(`${BASE_URL}/?renderer=pathtrace`, {
    waitUntil: 'domcontentloaded',
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
  await new Promise((r) => setTimeout(r, 4000));

  const info = await page.evaluate(() => {
    const hud = document.querySelector('.path-trace-hud')?.textContent ?? null;
    const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    let centerPixel: number[] | null = null;
    if (canvas) {
      const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
      if (gl) {
        const buf = new Uint8Array(4);
        gl.readPixels(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          buf
        );
        centerPixel = [buf[0], buf[1], buf[2], buf[3]];
      }
    }
    return { hud, centerPixel, canvasSize: canvas ? [canvas.width, canvas.height] : null };
  });

  console.log(JSON.stringify({ info, shaderErrors: logs.filter((l) => /shader|Path trace|error/i.test(l)).slice(0, 10) }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
