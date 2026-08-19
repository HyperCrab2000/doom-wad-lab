/**
 * Regression: switching GZDoom gold → modular must load gzdoom-s.js (not reuse gold factory)
 * and preserve full-frame viewport (no tiny-corner WebGL corruption).
 */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL ?? 'http://localhost:5150';

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.goto(`${BASE}/?renderer=gzdoom-wasm&map=E1M1`, {
    waitUntil: 'networkidle2',
    timeout: 60_000,
  });
  await page.waitForSelector('.control-field__input--engine');

  const playStart = Date.now();
  while (Date.now() - playStart < 180_000) {
    const ready = await page.evaluate(() => {
      const c = document.querySelector('.gzdoom-wasm-play-canvas') as HTMLCanvasElement | null;
      return (
        c != null &&
        c.width >= 640 &&
        document.querySelector('.level-viewer')?.getAttribute('data-classic-play-state') === 'ready'
      );
    });
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  const beforeSwitch = await page.evaluate(() => ({
    layerRail: !!document.querySelector('.layer-rail'),
    goldScript: !!document.querySelector('script[data-gzdoom-wasm]'),
    sScript: !!document.querySelector('script[data-gzdoom-s-wasm]'),
  }));

  if (beforeSwitch.layerRail) {
    throw new Error('layer rail visible on GZDoom gold before switch');
  }

  await page.select('.control-field__input--engine', 'gzdoom-s-wasm');

  const switchStart = Date.now();
  while (Date.now() - switchStart < 240_000) {
    const st = await page.evaluate(() => {
      const c = document.querySelector('.gzdoom-wasm-play-canvas') as HTMLCanvasElement | null;
      const vp = document.querySelector('.game-card__viewport')?.getBoundingClientRect();
      const r = c?.getBoundingClientRect();
      return {
        playState: document.querySelector('.level-viewer')?.getAttribute('data-classic-play-state'),
        layerRail: !!document.querySelector('.layer-rail'),
        sScript: !!document.querySelector('script[data-gzdoom-s-wasm]'),
        goldScript: !!document.querySelector('script[data-gzdoom-wasm]'),
        canvas:
          r && vp
            ? { w: r.width, h: r.height, fill: r.height / (vp.height || 1) }
            : null,
      };
    });
    if (
      st.playState === 'ready' &&
      st.layerRail &&
      st.sScript &&
      st.canvas &&
      st.canvas.fill > 0.5 &&
      st.canvas.w > 400
    ) {
      console.log('PASS gold→modular switch', JSON.stringify({ beforeSwitch, after: st }, null, 2));
      await browser.close();
      return;
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  throw new Error('timeout waiting for modular play after gold switch');
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
