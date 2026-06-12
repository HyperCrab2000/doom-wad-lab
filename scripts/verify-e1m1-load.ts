/**
 * Browser test: auto-load E1M1, then fail if the renderer is mostly black while playing.
 * Uses element screenshots (composited pixels), not drawImage from the GL back buffer.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import {
  measureVisibleGameCanvas,
  VISIBLE_PROBE_SCRIPT,
} from '../test/browser/puppeteerVisibleProbe';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const OUT_DIR = path.join(process.cwd(), 'tmp-e1m1-verify');
const MAX_BLACK_RATIO = Number(process.env.MAX_BLACK_RATIO ?? '0.45');
const GRID = 10;

type Measure = Awaited<ReturnType<typeof measureVisibleGameCanvas>>;

async function waitForPlaying(page: import('puppeteer').Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const viewer = document.querySelector('.level-viewer');
      return (
        viewer?.getAttribute('data-map-load-state') === 'ready' &&
        viewer?.getAttribute('data-is-playing') === 'true'
      );
    },
    { timeout: 120_000 }
  );
}

async function runLoadCheck(page: import('puppeteer').Page, name: string) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 120_000 });
  const wadSelect = await page.$('.level-toolbar select');
  if (wadSelect) {
    await wadSelect.select('/wads/DOOM.WAD');
  }
  await waitForPlaying(page);

  const timeline: Measure[] = [];
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    timeline.push(await measureVisibleGameCanvas(page, GRID));
  }

  const mostlyBlack = timeline.filter(
    (m) => m.isPlaying && m.mapLoadState === 'ready' && m.blackRatio > MAX_BLACK_RATIO
  );
  const final = timeline[timeline.length - 1]!;

  const shotPath = path.join(OUT_DIR, `${name}.png`);
  const gameCanvas = await page.$('.game-canvas');
  if (gameCanvas) {
    await gameCanvas.screenshot({ path: shotPath });
  } else {
    await page.screenshot({ path: shotPath, fullPage: false });
  }

  return { name, timeline, mostlyBlack, final, shotPath };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(VISIBLE_PROBE_SCRIPT);
  await page.setViewport({ width: 1280, height: 900 });

  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  const result = await runLoadCheck(page, 'e1m1-autoload');
  await browser.close();

  const report = {
    maxBlackRatio: MAX_BLACK_RATIO,
    probe: 'visible-2d-canvas',
    consoleErrors,
    mostlyBlackSamples: result.mostlyBlack.length,
    final: result.final,
    screenshot: result.shotPath,
    timeline: result.timeline.filter((_, i) => i % 5 === 0 || i === result.timeline.length - 1),
  };

  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (consoleErrors.length > 0) {
    console.error('FAIL: console errors');
    process.exit(1);
  }
  if (!result.final.toolbarVisible) {
    console.error('FAIL: WAD/map toolbar not visible while playing');
    process.exit(1);
  }
  if (!result.final.fpsLive) {
    console.error('FAIL: render loop not running');
    process.exit(1);
  }
  if (!result.final.hudVisible) {
    console.error('FAIL: HUD not visible');
    process.exit(1);
  }
  if (result.final.glBlackRatio > MAX_BLACK_RATIO) {
    console.error('FAIL: WebGL framebuffer is black after load');
    process.exit(1);
  }
  if (result.final.imgBlackRatio > MAX_BLACK_RATIO) {
    console.error(
      `FAIL: visible game image is black (imgBlackRatio=${result.final.imgBlackRatio.toFixed(2)})`
    );
    process.exit(1);
  }
  if (result.final.blackRatio > MAX_BLACK_RATIO) {
    console.error(`FAIL: combined black ratio ${result.final.blackRatio.toFixed(2)}`);
    process.exit(1);
  }
  if (!result.final.hasGameDisplay) {
    console.error('FAIL: .game-display img missing (presentation layer)');
    process.exit(1);
  }
  if ((result.final.rect?.h ?? 0) < 64) {
    console.error(`FAIL: game viewport layout height too small (${result.final.rect?.h})`);
    process.exit(1);
  }
  if (result.mostlyBlack.length > 4) {
    console.error(
      `FAIL: renderer stayed mostly black for ${result.mostlyBlack.length * 250}ms after ready`
    );
    process.exit(1);
  }

  console.log('PASS: E1M1 loaded and renderer is visibly drawing');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
