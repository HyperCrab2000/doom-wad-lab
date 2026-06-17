import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT = path.resolve('tmp-e1m1-verify');

function parseHud(hud) {
  const triMatch = hud.match(/(\d+)\s+tris/);
  const rtMatch = hud.match(/(\d+)×(\d+)\s+rt/);
  const viewMatch = hud.match(/view\s+(\d+)×(\d+)/);
  return {
    tris: triMatch ? Number(triMatch[1]) : 0,
    viewW: rtMatch ? Number(rtMatch[1]) : viewMatch ? Number(viewMatch[1]) : 0,
    viewH: rtMatch ? Number(rtMatch[2]) : viewMatch ? Number(viewMatch[2]) : 0,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    channel: 'chrome',
    protocolTimeout: 120_000,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120_000);
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[err] ${e.message}`));

  await page.setViewport({ width: 1280, height: 900 });
  console.log('loading page...');
  await page.goto(`${BASE}/?renderer=pathtrace`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const selects = await page.$$('select');
  if (selects[1]) await selects[1].select('E1M1');

  console.log('waiting for ready+playing...');
  await page.waitForFunction(
    () => {
      const viewer = document.querySelector('.level-viewer');
      return (
        viewer?.getAttribute('data-map-load-state') === 'ready' &&
        viewer?.getAttribute('data-is-playing') === 'true'
      );
    },
    { timeout: 120_000, polling: 500 }
  );

  console.log('waiting for geometry HUD (max 90s)...');
  let hud = '';
  try {
    hud = await page
      .waitForFunction(
        () => {
          const t = document.querySelector('.path-trace-hud')?.textContent ?? '';
          const m = t.match(/(\d+)\s+tris.*(\d+)×(\d+)\s+rt/) ?? t.match(/(\d+)\s+tris.*view\s+(\d+)×(\d+)/);
          if (!m) return null;
          const tris = Number(m[1]);
          const vw = Number(m[2]);
          const vh = Number(m[3]);
          if (tris < 100 || vw < 100 || vh < 50) return null;
          return t;
        },
        { timeout: 90_000, polling: 1000 }
      )
      .then((h) => h.jsonValue());
  } catch {
    hud = await page.evaluate(() => document.querySelector('.path-trace-hud')?.textContent ?? '');
    console.log('geometry wait timed out; last HUD:', hud);
  }

  await new Promise((r) => setTimeout(r, 4000));
  const shotPath = path.join(OUT, 'pathtrace-live.png');
  await page.screenshot({ path: shotPath, fullPage: false });

  const analysis = await page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas');
    const hud = document.querySelector('.path-trace-hud')?.textContent ?? '';
    if (!canvas) return { error: 'no canvas', hud };
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) return { error: 'no gl', hud };

    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.floor(w / 320);
    const pfW = 320 * scale;
    const pfH = 168 * scale;
    const pfX = Math.round((w - pfW) / 2);
    const pfY = Math.max(0, Math.round((h - 200 * scale) / 2));

    const rowStats = [];
    for (let row = 0; row < 8; row++) {
      const y = pfY + Math.floor(((row + 0.5) / 8) * pfH);
      let nonSky = 0;
      let magenta = 0;
      for (let col = 0; col < 16; col++) {
        const x = pfX + Math.floor(((col + 0.5) / 16) * pfW);
        const buf = new Uint8Array(4);
        gl.readPixels(x, h - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        if (buf[0] > 200 && buf[1] < 50 && buf[2] > 200) magenta++;
        else if (!(buf[0] === 115 && buf[1] === 158 && buf[2] === 224)) nonSky++;
      }
      rowStats.push({ y: row, nonSky, magenta });
    }

    let marginMagenta = 0;
    for (let i = 0; i < 20; i++) {
      const x = Math.floor((i / 19) * w);
      const buf = new Uint8Array(4);
      gl.readPixels(x, Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      if (buf[0] > 200 && buf[1] < 50 && buf[2] > 200) marginMagenta++;
    }

    const midY = pfY + Math.floor(pfH * 0.35);
    const bufL = new Uint8Array(4);
    const bufR = new Uint8Array(4);
    gl.readPixels(pfX + Math.floor(pfW * 0.2), h - 1 - midY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bufL);
    gl.readPixels(pfX + Math.floor(pfW * 0.8), h - 1 - midY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bufR);
    const left = [bufL[0], bufL[1], bufL[2]];
    const right = [bufR[0], bufR[1], bufR[2]];

    return {
      hud,
      canvas: [w, h],
      playfield: { pfX, pfY, pfW, pfH },
      rowStats,
      marginMagenta,
      spread35: {
        left,
        right,
        leftWall: !(left[0] === 115 && left[1] === 158 && left[2] === 224),
        rightWall: !(right[0] === 115 && right[1] === 158 && right[2] === 224),
      },
    };
  });

  await browser.close();

  const hudStats = parseHud(hud);
  const rowStats = analysis.rowStats ?? [];
  const rowsWithWalls = rowStats.filter((r) => r.nonSky >= 4).length;
  const maxRowWalls = rowStats.reduce((m, r) => Math.max(m, r.nonSky), 0);
  const bandPattern = rowsWithWalls <= 2 && maxRowWalls >= 8;

  const report = {
    hud,
    hudStats,
    analysis,
    rowsWithWalls,
    bandPattern,
    screenshot: shotPath,
    logs: logs.filter((l) => /error|fail|shader/i.test(l)).slice(0, 15),
  };
  console.log(JSON.stringify(report, null, 2));

  const failures = [];
  if (!/GPU ray cast/i.test(hud)) failures.push('GPU path trace not running');
  if (/GPU failed/i.test(hud)) failures.push('GPU failed');
  if (hudStats.tris < 100) failures.push(`too few triangles (${hudStats.tris})`);
  if (hudStats.viewW < 100 || hudStats.viewH < 50) failures.push(`invalid view ${hudStats.viewW}×${hudStats.viewH}`);
  if ((analysis.marginMagenta ?? 0) < 4) failures.push('missing magenta margins');
  if (!analysis.spread35?.leftWall || !analysis.spread35?.rightWall) {
    failures.push('no walls at 35% row');
  }
  if (rowsWithWalls < 3) failures.push(`geometry sparse (${rowsWithWalls}/8 rows)`);
  if (bandPattern) failures.push('horizontal band pattern');

  if (failures.length > 0) {
    console.error('FAIL:', failures.join('; '));
    process.exit(1);
  }
  console.log('PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
