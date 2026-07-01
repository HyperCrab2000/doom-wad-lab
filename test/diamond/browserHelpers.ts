import type { Page } from 'puppeteer';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function forcePreserveDrawingBuffer(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    const orig = HTMLCanvasElement.prototype.getContext as (
      this: HTMLCanvasElement,
      id: string,
      attrs?: unknown,
    ) => unknown;
    HTMLCanvasElement.prototype.getContext = function (id: string, attrs?: Record<string, unknown>) {
      if (id === 'webgl2' || id === 'webgl') attrs = { ...(attrs ?? {}), preserveDrawingBuffer: true };
      return orig.call(this, id, attrs);
    } as typeof orig;
  });
}

export async function waitViewerReady(
  page: Page,
  opts: { playState?: boolean; timeoutMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await page.evaluate(() => ({
      mapState: document.querySelector('.level-viewer')?.getAttribute('data-map-load-state'),
      playState: document.querySelector('.level-viewer')?.getAttribute('data-classic-play-state'),
      playing: document.querySelector('.level-viewer')?.getAttribute('data-is-playing'),
      canvasHidden: document.querySelector('canvas.game-canvas')?.classList.contains('game-canvas--hidden'),
      gzdoomCanvas: Boolean(document.querySelector('canvas.gzdoom-wasm-play-canvas')),
    }));
    if (state.mapState === 'error' || state.playState === 'error') {
      throw new Error('viewer entered error state');
    }
    if (opts.playState) {
      if (state.playState === 'ready') return;
    } else {
      const mapOk = state.mapState === 'ready';
      const visibleOk = state.gzdoomCanvas || !state.canvasHidden;
      if (mapOk && state.playing === 'true' && visibleOk) return;
    }
    await sleep(400);
  }
  throw new Error('viewer never became ready');
}

export async function readPerfMeter(page: Page): Promise<{
  visible: boolean;
  fps: string | null;
  ms: string | null;
  chartHasPixels: boolean;
}> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="perf-meter"]');
    if (!root || getComputedStyle(root).display === 'none') {
      return { visible: false, fps: null, ms: null, chartHasPixels: false };
    }
    const fps = root.querySelector('.perf-meter__value:not(.perf-meter__value--ms)')?.textContent?.trim() ?? null;
    const ms = root.querySelector('.perf-meter__value--ms')?.textContent?.trim() ?? null;
    const chart = root.querySelector('[data-testid="perf-meter-chart"]') as HTMLCanvasElement | null;
    let chartHasPixels = false;
    if (chart) {
      const ctx = chart.getContext('2d');
      if (ctx) {
        const data = ctx.getImageData(0, 0, chart.width, chart.height).data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i]! + data[i + 1]! + data[i + 2]! > 8) {
            chartHasPixels = true;
            break;
          }
        }
      }
    }
    return { visible: true, fps, ms, chartHasPixels };
  });
}

export async function assertRootIntact(page: Page): Promise<void> {
  const len = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0);
  if (len < 100) throw new Error('React root wiped — possible crash');
}

export async function selectEngine(page: Page, engine: string): Promise<void> {
  await page.select('.control-field__input--engine', engine);
  await sleep(800);
}

export async function selectMap(page: Page, map: string): Promise<void> {
  await page.select('.control-field__input--map', map);
  await sleep(800);
}

export async function selectWad(page: Page, path: string): Promise<void> {
  const sel = await page.$('.level-chrome__selects select');
  if (sel) await sel.select(path);
  await sleep(800);
}
