import puppeteer from 'puppeteer';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5150/?renderer=pathtrace', {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const selects = await page.$$('select');
  if (selects[1]) await selects[1].select('E1M1');
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120000 }
  );
  await new Promise((r) => setTimeout(r, 6000));

  const info = await page.evaluate(() => {
    const hud = document.querySelector('.path-trace-hud')?.textContent ?? '';
    const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    if (!canvas) return { hud, error: 'no canvas' };
    const gl = canvas.getContext('webgl2');
    if (!gl) return { hud, error: 'no gl' };

    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const sample = (x: number, y: number) => {
      const py = h - 1 - y;
      const i = (py * w + x) * 4;
      return [pixels[i], pixels[i + 1], pixels[i + 2]];
    };

    return {
      hud,
      size: [w, h],
      center: sample(Math.floor(w / 2), Math.floor(h / 2)),
      topLeft: sample(10, 10),
      topRight: sample(w - 10, 10),
      bottomLeft: sample(10, h - 10),
      bottomRight: sample(w - 10, h - 10),
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
