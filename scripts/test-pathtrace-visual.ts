import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT = path.resolve('tmp-e1m1-verify');
const SKY = [115, 158, 224] as const;

function parseHud(hud: string) {
  const triMatch = hud.match(/(\d+)\s+tris/);
  const viewMatch = hud.match(/view\s+(\d+)×(\d+)/);
  const rtMatch = hud.match(/rt\s+(\d+)×(\d+)/);
  return {
    tris: triMatch ? Number(triMatch[1]) : 0,
    viewW: viewMatch ? Number(viewMatch[1]) : 0,
    viewH: viewMatch ? Number(viewMatch[2]) : 0,
    rtW: rtMatch ? Number(rtMatch[1]) : 0,
    rtH: rtMatch ? Number(rtMatch[2]) : 0,
  };
}

function isSky(r: number, g: number, b: number): boolean {
  return r === SKY[0] && g === SKY[1] && b === SKY[2];
}

function isMagenta(r: number, g: number, b: number): boolean {
  return r > 200 && g < 50 && b > 200;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
    protocolTimeout: 600_000,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(600_000);
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[err] ${e.message}`));

  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/?renderer=pathtrace`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.level-toolbar select');
  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const selects = await page.$$('select');
  if (selects[1]) await selects[1].select('E1M1');

  await page.waitForFunction(
    () => {
      const viewer = document.querySelector('.level-viewer');
      return (
        viewer?.getAttribute('data-map-load-state') === 'ready' &&
        viewer?.getAttribute('data-is-playing') === 'true'
      );
    },
    { timeout: 600_000, polling: 500 }
  );

  const hud = await page
    .waitForFunction(
      () => {
        const t = document.querySelector('.path-trace-hud')?.textContent ?? '';
        const m = t.match(/(\d+)\s+tris.*view\s+(\d+)×(\d+)/);
        if (!m) return null;
        const tris = Number(m[1]);
        const vw = Number(m[2]);
        const vh = Number(m[3]);
        if (tris < 100 || vw < 100 || vh < 50) return null;
        return t;
      },
      { timeout: 600_000, polling: 1000 }
    )
    .then((h) => h.jsonValue() as Promise<string>);

  await new Promise((r) => setTimeout(r, 4000));
  const shotPath = path.join(OUT, 'pathtrace-live.png');
  await page.screenshot({ path: shotPath, fullPage: false });

  const analysis = await page.evaluate(function () {
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
        const r = buf[0];
        const g = buf[1];
        const b = buf[2];
        if (r > 200 && g < 50 && b > 200) magenta++;
        else if (!(r === 115 && g === 158 && b === 224)) nonSky++;
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
  const rowsWithWalls = rowStats.filter((r: { nonSky: number }) => r.nonSky >= 4).length;
  const maxRowWalls = rowStats.reduce((m: number, r: { nonSky: number }) => Math.max(m, r.nonSky), 0);
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

  const failures: string[] = [];
  if (!/GPU ray cast/i.test(hud)) failures.push('GPU path trace not running');
  if (hudStats.tris < 100) failures.push(`too few triangles (${hudStats.tris})`);
  if (hudStats.viewW < 100 || hudStats.viewH < 50) failures.push(`invalid view size ${hudStats.viewW}×${hudStats.viewH}`);
  if ((analysis.marginMagenta ?? 0) < 4) failures.push('missing magenta chromakey margins');
  if (!analysis.spread35?.leftWall || !analysis.spread35?.rightWall) {
    failures.push('no walls at 35% row (left/right still sky)');
  }
  if (rowsWithWalls < 3) failures.push(`geometry too sparse across rows (${rowsWithWalls}/8)`);
  if (bandPattern) failures.push('horizontal band pattern (walls in ≤2 rows only)');

  if (failures.length > 0) {
    console.error('FAIL:', failures.join('; '));
    process.exit(1);
  }
  console.log('PASS: corridor geometry spread across multiple rows');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
