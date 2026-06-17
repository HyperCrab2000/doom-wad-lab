import { webkit } from '@playwright/test';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';

async function main() {
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await page.goto(`${BASE_URL}/?renderer=pathtrace`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.level-toolbar select');
  await page.locator('.level-toolbar select').first().selectOption('/wads/DOOM.WAD');
  const mapSelect = page.locator('select').nth(1);
  if (await mapSelect.count()) await mapSelect.selectOption('E1M1');
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120000 }
  );
  await page.waitForTimeout(8000);

  const info = await page.evaluate(() => {
    const hud = document.querySelector('.path-trace-hud')?.textContent ?? null;
    const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    if (!canvas) return { error: 'no canvas', hud };
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) return { error: 'no gl', hud };

    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let nonSky = 0;
    let magenta = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const py = h - 1 - y;
        const i = (py * w + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (r > 200 && g < 50 && b > 200) magenta++;
        else if (!(r === 115 && g === 158 && b === 224)) nonSky++;
      }
    }

    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const ci = (cy * w + cx) * 4;
    return {
      hud,
      size: [w, h],
      nonSky,
      magenta,
      center: [pixels[ci], pixels[ci + 1], pixels[ci + 2]],
      userAgent: navigator.userAgent,
    };
  });

  console.log(JSON.stringify({ info, shaderLogs: logs.filter((l) => /shader|Path trace|error|GPU/i.test(l)).slice(0, 15) }, null, 2));
  await browser.close();

  const nonSky = (info as { nonSky?: number }).nonSky ?? 0;
  const hud = (info as { hud?: string }).hud ?? '';
  if (!/GPU ray cast/i.test(hud)) {
    console.error('FAIL webkit: no GPU ray cast in HUD:', hud);
    process.exit(1);
  }
  if (nonSky < 5000) {
    console.error('FAIL webkit: expected geometry, nonSky=', nonSky);
    process.exit(1);
  }
  console.log('PASS webkit path trace');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
