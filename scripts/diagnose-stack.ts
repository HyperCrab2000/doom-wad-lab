import puppeteer from 'puppeteer';
import {
  measureVisibleGameCanvas,
  VISIBLE_PROBE_SCRIPT,
} from '../test/browser/puppeteerVisibleProbe';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(VISIBLE_PROBE_SCRIPT);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5150/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const fps = document.getElementById('fps-counter')?.textContent ?? '';
      return fps.includes('(') && !fps.includes('paused') && !fps.includes('idle');
    },
    { timeout: 120_000 }
  );
  await new Promise((r) => setTimeout(r, 10000));

  const measure = await measureVisibleGameCanvas(page, 10);
  const stack = await page.evaluate(() => {
    const vp = document.querySelector('.game-card__viewport');
    const r = vp?.getBoundingClientRect();
    if (!r) return null;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const el = document.elementFromPoint(cx, cy);
    const chain: Array<Record<string, string>> = [];
    let n: Element | null = el;
    while (n && n !== document.body) {
      const s = getComputedStyle(n);
      chain.push({
        tag: n.tagName,
        class: (n as HTMLElement).className?.toString?.() ?? '',
        z: s.zIndex,
        op: s.opacity,
        vis: s.visibility,
        disp: s.display,
      });
      n = n.parentElement;
    }
    const img = document.querySelector('.game-display') as HTMLImageElement | null;
    const automap = document.querySelector('.automap-canvas') as HTMLCanvasElement | null;
    return {
      top: el ? `${el.tagName}.${(el as HTMLElement).className}` : null,
      chain,
      img: img
        ? {
            z: getComputedStyle(img).zIndex,
            rect: img.getBoundingClientRect().toJSON(),
            complete: img.complete,
            nw: img.naturalWidth,
          }
        : null,
      automap: automap
        ? {
            z: getComputedStyle(automap).zIndex,
            op: getComputedStyle(automap).opacity,
            w: automap.width,
            h: automap.height,
          }
        : null,
    };
  });

  console.log(JSON.stringify({ measure, stack }, null, 2));
  await browser.close();
}

main();
