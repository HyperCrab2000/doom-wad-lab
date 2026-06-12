import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT = path.join(process.cwd(), 'tmp-load-check');

async function snapState(page: import('puppeteer').Page) {
  return page.evaluate(() => {
    const game = document.querySelector('.game-canvas') as HTMLCanvasElement | null;
    const viewer = document.querySelector('.level-viewer');
    const gl = game?.getContext('webgl2');
    let px: number[] | null = null;
    if (gl && game && game.width > 0 && game.height > 0) {
      const p = new Uint8Array(4);
      gl.readPixels(game.width >> 1, game.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      px = Array.from(p);
    }
    return {
      mapLoadState: viewer?.getAttribute('data-map-load-state'),
      isPlaying: viewer?.getAttribute('data-is-playing'),
      intermission: viewer?.getAttribute('data-intermission'),
      hud: !!document.querySelector('canvas.doom-hud'),
      overlay: !!document.querySelector('.doom-level-transition--active'),
      rendererError: document.querySelector('.renderer-error')?.textContent ?? null,
      fps: document.getElementById('fps-counter')?.textContent ?? null,
      gameSize: game ? [game.width, game.height] : null,
      px,
      selectedMap: (document.querySelectorAll('.level-toolbar select')[1] as HTMLSelectElement | undefined)?.value ?? null,
    };
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`PAGE: ${e.message}`));

  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.screenshot({ path: path.join(OUT, '01-initial.png') });

  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  const timeline: Awaited<ReturnType<typeof snapState>>[] = [];
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    timeline.push(await snapState(page));
  }
  await page.screenshot({ path: path.join(OUT, '02-after-wad.png') });

  // switch to E1M1 explicitly
  const mapSelect = (await page.$$('select'))[1];
  if (mapSelect) {
    await mapSelect.select('E1M1');
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 100));
      timeline.push(await snapState(page));
    }
  }
  await page.screenshot({ path: path.join(OUT, '03-e1m1.png') });

  const blackWhenReady = timeline.filter(
    (s) => s.mapLoadState === 'ready' && (!s.px || (s.px[0] === 0 && s.px[1] === 0 && s.px[2] === 0))
  );
  const readyNoHud = timeline.filter((s) => s.mapLoadState === 'ready' && !s.hud);
  const final = timeline[timeline.length - 1];

  const report = { consoleErrors, blackWhenReady: blackWhenReady.length, readyNoHud: readyNoHud.length, final, samples: timeline.filter((_, i) => i % 15 === 0) };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  if (consoleErrors.length) process.exit(1);
  if (blackWhenReady.length > 5) process.exit(1);
  if (final?.mapLoadState === 'ready' && final.px && final.px[0] === 0 && final.px[1] === 0 && final.px[2] === 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
