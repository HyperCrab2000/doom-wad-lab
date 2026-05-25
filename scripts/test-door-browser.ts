/**
 * Trigger E1M1 door in-browser and verify the render loop stays alive.
 */
import puppeteer from 'puppeteer';

const BASE_URL = process.env.DOOR_TEST_URL ?? 'http://127.0.0.1:5173';

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });

  await page.select('.level-toolbar select', '/wads/DOOM.WAD');
  await page.waitForFunction(
    () => document.querySelectorAll('.level-toolbar select')[1]?.querySelectorAll('option').length > 1,
    { timeout: 15000 }
  );
  const selects = await page.$$('.level-toolbar select');
  await selects[1]!.select('E1M1');

  await page.waitForFunction(
    () => document.querySelector('#fps-counter')?.textContent?.includes('FPS'),
    { timeout: 90000 }
  );

  // Wait for playing phase (canvas visible, not hidden)
  await page.waitForFunction(
    () => !document.querySelector('.game-card--hidden'),
    { timeout: 30000 }
  );

  const framesBefore = await page.evaluate(() => {
    (window as unknown as { __frames: number }).__frames = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) =>
      orig((t) => {
        (window as unknown as { __frames: number }).__frames++;
        cb(t);
      });
    return 0;
  });

  // Click canvas to use door / pointer lock
  const canvas = await page.$('.game-canvas');
  if (!canvas) throw new Error('No game canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('No canvas bounds');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await new Promise((r) => setTimeout(r, 3000));

  const result = await page.evaluate(() => {
    const fps = document.querySelector('#fps-counter')?.textContent ?? '';
    const frames = (window as unknown as { __frames?: number }).__frames ?? 0;
    return { fps, frames };
  });

  console.log('FPS counter:', result.fps);
  console.log('rAF frames in 3s after door click:', result.frames);
  console.log('Page errors:', errors.slice(0, 10));

  if (result.frames < 30) {
    throw new Error(`Render loop stalled (${result.frames} frames in 3s)`);
  }

  if (errors.some((e) => e.includes('bufferSubData') || e.includes('WebGL'))) {
    throw new Error(`WebGL errors: ${errors.join('; ')}`);
  }

  console.log('OK: render loop stayed alive after door use');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
