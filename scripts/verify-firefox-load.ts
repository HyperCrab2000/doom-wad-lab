import { firefox } from '@playwright/test';
import {
  measureVisibleGameCanvas,
  VISIBLE_PROBE_SCRIPT,
} from '../test/browser/puppeteerVisibleProbe';

const BASE_URL = process.env.TEST_URL ?? 'http://127.0.0.1:5150';
const MAX_BLACK_RATIO = 0.45;
const GRID = 10;

async function main() {
  const browser = await firefox.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(VISIBLE_PROBE_SCRIPT);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () =>
      document.querySelector('.level-viewer')?.getAttribute('data-map-load-state') === 'ready' &&
      document.querySelector('.level-viewer')?.getAttribute('data-is-playing') === 'true',
    { timeout: 120_000 }
  );

  const timeline = [];
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    timeline.push(await measureVisibleGameCanvas(page, GRID));
  }

  await browser.close();

  const final = timeline[timeline.length - 1]!;
  console.log(JSON.stringify({ final, timeline: timeline.filter((_, i) => i % 4 === 0) }, null, 2));

  if (!final.fpsLive || !final.toolbarVisible || !final.hudVisible || !final.hasWebgl) {
    console.error('FAIL: Firefox render prerequisites');
    process.exit(1);
  }
  if (final.glBlackRatio > MAX_BLACK_RATIO) {
    console.error('FAIL: Firefox WebGL framebuffer is black');
    process.exit(1);
  }
  if (final.imgBlackRatio > MAX_BLACK_RATIO) {
    console.error(`FAIL: Firefox visible game image black (imgBlackRatio=${final.imgBlackRatio})`);
    process.exit(1);
  }
  if (final.blackRatio > MAX_BLACK_RATIO) {
    console.error(`FAIL: Firefox combined black ratio ${final.blackRatio}`);
    process.exit(1);
  }

  console.log('PASS: Firefox E1M1 visible');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
