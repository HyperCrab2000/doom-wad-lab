/**
 * Browser verification: GPU path trace row stats must resemble CPU reference.
 * Run with dev server on :5150.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT = path.resolve('tmp-e1m1-verify');
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function rowStats(data, w, h, pfX, pfY, pfW, pfH, flipY = false) {
  const rows = [];
  for (let row = 0; row < 8; row++) {
    const cssY = pfY + Math.floor(((row + 0.5) / 8) * pfH);
    const y = flipY ? h - 1 - cssY : cssY;
    let sky = 0;
    let geom = 0;
    let magenta = 0;
    for (let col = 0; col < 16; col++) {
      const x = pfX + Math.floor(((col + 0.5) / 16) * pfW);
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 200 && g < 50 && b > 200) magenta++;
      else if (r === 115 && g === 158 && b === 224) sky++;
      else geom++;
    }
    rows.push({ row, sky, geom, magenta });
  }
  return rows;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    channel: fs.existsSync(CHROME) ? undefined : 'chrome',
    args: ['--no-sandbox'],
    protocolTimeout: 600_000,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120_000);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/?renderer=pathtrace&_=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const mapSelect = await page.$$('select');
  if (mapSelect[1]) await mapSelect[1].select('E1M1');
  await page.waitForFunction(
    () => document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') === 'ready',
    { timeout: 120_000, polling: 500 }
  );
  await page.waitForFunction(
    () => /GPU ray cast/i.test(document.querySelector('.path-trace-hud')?.textContent ?? '') && /\d+\s+tris/i.test(document.querySelector('.path-trace-hud')?.textContent ?? ''),
    { timeout: 120_000, polling: 500 }
  );
  await new Promise((r) => setTimeout(r, 500));

  const result = await page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas');
    const hud = document.querySelector('.path-trace-hud')?.textContent ?? '';
    if (!canvas) return { error: 'no canvas', hud };
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) return { error: 'no gl', hud };
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.max(1, Math.floor(w / 320));
    const pfW = 320 * scale;
    const pfH = 168 * scale;
    const pfX = Math.round((w - pfW) / 2);
    const frameH = 200 * scale;
    const pfY = Math.max(0, Math.round((h - frameH) / 2));
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const rows = [];
    let nonSky = 0;
    for (let row = 0; row < 8; row++) {
      const cssY = pfY + Math.floor(((row + 0.5) / 8) * pfH);
      const glY = h - 1 - cssY;
      let sky = 0;
      let geom = 0;
      let magenta = 0;
      for (let col = 0; col < 16; col++) {
        const x = pfX + Math.floor(((col + 0.5) / 16) * pfW);
        const i = (glY * w + x) * 4;
        const r = buf[i];
        const g = buf[i + 1];
        const b = buf[i + 2];
        if (r > 200 && g < 50 && b > 200) magenta++;
        else if (r === 115 && g === 158 && b === 224) sky++;
        else {
          geom++;
          nonSky++;
        }
      }
      rows.push({ row, sky, geom, magenta });
    }
    return { hud, rows, nonSkyRatio: nonSky / (8 * 16), pfX, pfY, pfW, pfH };
  });

  await page.screenshot({ path: path.join(OUT, 'gpu-compare.png') });
  await browser.close();

  if (result.error) {
    console.error('FAIL:', result.error, result.hud);
    process.exit(1);
  }

  const rows = result.rows;
  const geomRows = rows.filter((r) => r.geom >= 8).length;
  const topGeom = rows.slice(0, 4).reduce((s, r) => s + r.geom, 0);
  const bottomSky = rows.slice(4).every((r) => r.sky >= 12);

  const report = {
    hud: result.hud,
    rows,
    geomRows,
    topGeom,
    bottomSky,
    nonSkyRatio: result.nonSkyRatio,
    screenshot: path.join(OUT, 'gpu-compare.png'),
  };
  console.log(JSON.stringify(report, null, 2));

  const failures = [];
  if (!/GPU ray cast/i.test(result.hud)) failures.push('GPU not running');
  if (/GPU failed/i.test(result.hud)) failures.push('GPU failed: ' + result.hud);
  if (geomRows < 3) failures.push(`too few geometry rows (${geomRows}/8)`);
  if (topGeom < 28) failures.push(`top half too empty (geom pixels ${topGeom})`);
  if (result.nonSkyRatio < 0.25) failures.push(`non-sky ratio too low (${result.nonSkyRatio.toFixed(3)})`);

  if (failures.length) {
    console.error('FAIL:', failures.join('; '));
    process.exit(1);
  }
  console.log('PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
