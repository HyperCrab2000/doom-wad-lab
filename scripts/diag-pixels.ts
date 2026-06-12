import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5151';

async function main() {
  const errors: string[] = [];
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  await page.waitForFunction(
    () => {
      const map = document.querySelectorAll('.level-toolbar select')[1] as HTMLSelectElement | undefined;
      return map && !map.disabled;
    },
    { timeout: 120000 }
  );
  const selects = await page.$$('select');
  await selects[1]!.select('E1M1');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /play/i.test(b.textContent ?? ''));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 8000));

  const data = await page.evaluate(() => {
    const game = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    const gl = game?.getContext('webgl2');
    if (!gl || !game) return { err: 'no gl' as const };
    const samples: Record<string, number[]> = {};
    const points: Record<string, [number, number]> = {
      center: [0.5, 0.5],
      top: [0.5, 0.85],
      bottom: [0.5, 0.15],
      left: [0.25, 0.5],
      right: [0.75, 0.5],
    };
    for (const [name, [fx, fy]] of Object.entries(points)) {
      const p = new Uint8Array(4);
      gl.readPixels(
        Math.floor(game.width * fx),
        Math.floor(game.height * fy),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        p
      );
      samples[name] = Array.from(p);
    }
    return {
      samples,
      size: [game.width, game.height] as [number, number],
      fps: document.getElementById('fps-counter')?.textContent ?? null,
      playing: document.querySelector('.level-viewer')?.getAttribute('data-is-playing') ?? null,
    };
  });

  console.log(JSON.stringify({ data, errors: errors.slice(0, 15) }, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
