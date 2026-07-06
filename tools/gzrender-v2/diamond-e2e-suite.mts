#!/usr/bin/env npx tsx
/**
 * Diamond E2E — full browser acceptance suite (preview or dev server).
 *
 * Usage: TEST_URL=http://127.0.0.1:4173 npx tsx tools/gzrender-v2/diamond-e2e-suite.mts
 */
import puppeteer, { type Browser, type Page } from 'puppeteer';
import {
  assertRootIntact,
  forcePreserveDrawingBuffer,
  readPerfMeter,
  selectEngine,
  selectMap,
  selectWad,
  sleep,
  waitViewerReady,
} from '../../test/diamond/browserHelpers';

const BASE = process.env.TEST_URL ?? 'http://127.0.0.1:4173';
const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

async function iwadAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/wads/DOOM.WAD`, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const len = Number(res.headers.get('content-length') ?? 0);
    return res.ok && len > 100_000;
  } catch {
    return false;
  }
}

/** True when the preview server serves a real artifact (not Vite HTML fallback). */
async function wasmAssetAvailable(urlPath: string, minBytes = 10_000): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}${urlPath}`, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) return false;
    const len = Number(res.headers.get('content-length') ?? 0);
    return len >= minBytes;
  } catch {
    return false;
  }
}

async function gzdoomGoldWasmAvailable(): Promise<boolean> {
  return (
    (await wasmAssetAvailable('/wasm/gzdoom/gzdoom.wasm')) ||
    (await wasmAssetAvailable('/wasm/gzdoom/gzdoom.js'))
  );
}

async function gzdoomModularWasmAvailable(): Promise<boolean> {
  return (
    (await wasmAssetAvailable('/wasm/gzdoom-s/gzdoom.wasm')) ||
    (await wasmAssetAvailable('/wasm/gzdoom-s/gzdoom.js'))
  );
}

function skip(name: string, reason: string) {
  results.push({ name, ok: true, detail: `SKIP: ${reason}` });
  console.log(`SKIP ${name} — ${reason}`);
}

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, err: unknown) {
  const detail = err instanceof Error ? err.message : String(err);
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name} — ${detail}`);
}

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    channel: process.env.PUPPETEER_CHANNEL ?? 'chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
    protocolTimeout: 600_000,
  });
}

async function trackErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (/favicon|wasm\/gzdoom|\/wads\/DOOM|Failed to load resource/i.test(t)) return;
      errors.push(t);
    }
  });
  return errors;
}

async function waitPerfMeterLive(page: Page, timeoutMs = 15_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const perf = await readPerfMeter(page);
    if (
      perf.visible &&
      perf.fps &&
      perf.fps !== '–' &&
      perf.ms &&
      perf.ms !== '–' &&
      perf.chartHasPixels
    ) {
      return;
    }
    await sleep(300);
  }
  const perf = await readPerfMeter(page);
  throw new Error(
    `PerfMeter not live (visible=${perf.visible} fps=${perf.fps} ms=${perf.ms} chart=${perf.chartHasPixels})`,
  );
}

async function scenarioAppShell(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (/favicon|wasm\/gzdoom|\/wads\/DOOM|Failed to load resource/i.test(t)) return;
      errors.push(t);
    }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('.level-chrome', { timeout: 60_000 });
  const chrome = await page.$('.level-chrome__selects');
  if (!chrome) throw new Error('level chrome missing');
  if (errors.length) throw new Error(`console errors: ${errors.join('; ')}`);
  pass('app-shell');
}

async function scenarioWadMapEngine(page: Page) {
  await page.goto(`${BASE}/?renderer=classic&map=E1M1&_=${Date.now()}`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await page.waitForSelector('.level-chrome', { timeout: 60_000 });
  const wadOpts = await page.$$eval('.level-chrome__selects select option', (o) =>
    o.map((el) => (el as HTMLOptionElement).value).filter(Boolean),
  );
  if (!wadOpts.some((v) => v.includes('DOOM'))) throw new Error('no DOOM WAD option');
  await waitViewerReady(page, { timeoutMs: 120_000 });
  const maps = await page.$$eval('.control-field__input--map option', (o) =>
    o.map((el) => (el as HTMLOptionElement).value).filter(Boolean),
  );
  if (!maps.includes('E1M1')) throw new Error('E1M1 not in map list');
  await selectMap(page, 'E1M2');
  await waitViewerReady(page, { timeoutMs: 120_000 });
  await selectMap(page, 'E1M1');
  await waitViewerReady(page, { timeoutMs: 120_000 });
  const engines = await page.$$eval('.control-field__input--engine option', (o) =>
    o.map((el) => (el as HTMLOptionElement).value),
  );
  if (!engines.includes('gzdoom-s-wasm') || !engines.includes('classic')) {
    throw new Error('engine select missing expected backends');
  }
  pass('wad-map-engine-selects', `${maps.length} maps`);
}

async function scenarioGzdoomGold(page: Page) {
  await page.goto(`${BASE}/?renderer=gzdoom-wasm&map=E1M1&_=${Date.now()}`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await page.waitForSelector('.level-chrome', { timeout: 60_000 });
  await waitViewerReady(page, { playState: true, timeoutMs: 240_000 });
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.segmented-control button'));
    const gold = buttons.find((b) => b.textContent?.trim() === 'Gold');
    if (gold instanceof HTMLButtonElement && !gold.disabled) gold.click();
  });
  const goldStarted = Date.now();
  while (Date.now() - goldStarted < 240_000) {
    const ok = await page.evaluate(() => {
      const gold = document.querySelector('.gzdoom-wasm-frame') as HTMLImageElement | null;
      const hud = document.querySelector('.gzdoom-wasm-hud')?.textContent ?? '';
      return (
        (gold instanceof HTMLImageElement && gold.complete && gold.naturalWidth > 64) ||
        /Gold ·|spawn frame|ref\.png/i.test(hud)
      );
    });
    if (ok) break;
    await sleep(1000);
  }
  const goldOk = await page.evaluate(() => {
    const gold = document.querySelector('.gzdoom-wasm-frame') as HTMLImageElement | null;
    const hud = document.querySelector('.gzdoom-wasm-hud')?.textContent ?? '';
    return (
      (gold instanceof HTMLImageElement && gold.complete && gold.naturalWidth > 64) ||
      /Gold ·|spawn frame|ref\.png/i.test(hud)
    );
  });
  if (!goldOk) throw new Error('gold frame or HUD not ready');
  await assertRootIntact(page);
  pass('gzdoom-gold-load');
}

async function scenarioGzdoomModularPlay(page: Page) {
  await page.goto(`${BASE}/?renderer=gzdoom-s-wasm&map=E1M1&_=${Date.now()}`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await waitViewerReady(page, { playState: true, timeoutMs: 240_000 });
  await sleep(2000);
  const hud = await page.$('.gzdoom-wasm-hud');
  if (!hud) throw new Error('GZDoom HUD missing');
  await waitPerfMeterLive(page);
  const perf = await readPerfMeter(page);
  // Live layer toggle — walls off
  await page.click('.layer-rail__toggle');
  await sleep(300);
  await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll('.render-layer-panel__group'));
    const geo = groups.find((g) => g.querySelector('h4')?.textContent?.trim() === 'Geometry');
    const walls = geo?.querySelector('input[type=checkbox]') as HTMLInputElement | null;
    if (walls?.checked) walls.click();
  });
  await sleep(1200);
  const playState = await page.evaluate(() =>
    document.querySelector('.level-viewer')?.getAttribute('data-classic-play-state'),
  );
  if (playState !== 'ready') throw new Error(`layer toggle caused reload: ${playState}`);
  await assertRootIntact(page);
  pass('gzdoom-modular-play-layers', `perf ${perf.fps}fps ${perf.ms}ms`);
}

async function scenarioClassicPlay(page: Page) {
  await page.goto(`${BASE}/?renderer=classic&map=E1M1&_=${Date.now()}`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await waitViewerReady(page);
  await sleep(2000);
  await waitPerfMeterLive(page);
  const ok = await page.evaluate(() => {
    const fn = (window as unknown as { __applyClassicLayerPreset?: (id: string) => unknown })
      .__applyClassicLayerPreset;
    return typeof fn === 'function';
  });
  if (!ok) throw new Error('__applyClassicLayerPreset missing');
  await page.evaluate(() => {
    (window as unknown as { __applyClassicLayerPreset: (id: string) => void }).__applyClassicLayerPreset(
      'walls-off',
    );
  });
  await sleep(1000);
  await assertRootIntact(page);
  pass('classic-play-layers');
}

async function scenarioAudioControls(page: Page) {
  await page.goto(`${BASE}/?renderer=gzdoom-s-wasm&map=E1M1&_=${Date.now()}`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await waitViewerReady(page, { playState: true, timeoutMs: 240_000 });
  const sfxBtn = await page.$('.level-chrome__audio .audio-chip__btn[aria-label*="sound"]');
  const musicBtn = await page.$('.level-chrome__audio .audio-chip__btn[aria-label*="music"]');
  if (!sfxBtn || !musicBtn) throw new Error('audio chips missing');
  await sfxBtn.click();
  await sleep(200);
  await sfxBtn.click();
  await musicBtn.click();
  await sleep(200);
  await assertRootIntact(page);
  pass('audio-sfx-music-toggle');
}

async function scenarioPlayability(page: Page) {
  await page.goto(`${BASE}/?renderer=gzdoom-s-wasm&map=E1M1&_=${Date.now()}`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await waitViewerReady(page, { playState: true, timeoutMs: 240_000 });
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('w');
  await sleep(500);
  const canvas = await page.$('canvas.gzdoom-wasm-play-canvas');
  if (!canvas) throw new Error('play canvas missing');
  await assertRootIntact(page);
  pass('playability-input');
}

async function main() {
  let browser: Browser | null = null;
  const hasIwad = await iwadAvailable();
  const hasGoldWasm = await gzdoomGoldWasmAvailable();
  const hasModularWasm = await gzdoomModularWasmAvailable();
  if (!hasIwad) {
    console.log('No DOOM.WAD on server — GZDoom E2E scenarios will skip (CI/preview without IWAD).');
  }
  if (!hasGoldWasm) {
    console.log('No /wasm/gzdoom/ artifact — gzdoom-gold-load will skip (run npm run build:gzdoom-wasm).');
  }
  if (!hasModularWasm) {
    console.log(
      'No /wasm/gzdoom-s/ artifact — modular GZDoom E2E will skip (run npm run bootstrap:gzdoom-s).',
    );
  }
  try {
    browser = await launchBrowser();
    const scenarios: Array<{
      name: string;
      run: (p: Page) => Promise<void>;
      needsIwad?: boolean;
      needsWasm?: 'gold' | 'modular';
    }> = [
      { name: 'wad-map-engine-selects', run: (p) => scenarioWadMapEngine(p) },
      { name: 'gzdoom-gold-load', run: (p) => scenarioGzdoomGold(p), needsIwad: true, needsWasm: 'gold' },
      { name: 'classic-play-layers', run: (p) => scenarioClassicPlay(p) },
      {
        name: 'gzdoom-modular-play-layers',
        run: (p) => scenarioGzdoomModularPlay(p),
        needsIwad: true,
        needsWasm: 'modular',
      },
      {
        name: 'audio-sfx-music-toggle',
        run: (p) => scenarioAudioControls(p),
        needsIwad: true,
        needsWasm: 'modular',
      },
      {
        name: 'playability-input',
        run: (p) => scenarioPlayability(p),
        needsIwad: true,
        needsWasm: 'modular',
      },
    ];

    {
      const shellPage = await browser.newPage();
      await forcePreserveDrawingBuffer(shellPage);
      await shellPage.setViewport({ width: 1280, height: 900 });
      try {
        const shellErrors: string[] = [];
        await scenarioAppShell(shellPage, shellErrors);
      } catch (e) {
        fail('app-shell', e);
      } finally {
        await shellPage.close().catch(() => {});
      }
    }

    for (const { name, run, needsIwad, needsWasm } of scenarios) {
      if (needsIwad && !hasIwad) {
        skip(name, 'no IWAD at /wads/DOOM.WAD');
        continue;
      }
      if (needsWasm === 'gold' && !hasGoldWasm) {
        skip(name, 'no GZDoom gold WASM at /wasm/gzdoom/');
        continue;
      }
      if (needsWasm === 'modular' && !hasModularWasm) {
        skip(name, 'no GZDoom (s) WASM at /wasm/gzdoom-s/');
        continue;
      }
      const scenarioPage = await browser.newPage();
      await forcePreserveDrawingBuffer(scenarioPage);
      await scenarioPage.setViewport({ width: 1280, height: 900 });
      try {
        await run(scenarioPage);
      } catch (e) {
        fail(name, e);
      } finally {
        await scenarioPage.close().catch(() => {});
      }
    }
  } finally {
    await browser?.close().catch(() => {});
  }

  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.detail?.startsWith('SKIP:')).length;
  console.log(
    `\n=== DIAMOND E2E: ${results.length - failed.length}/${results.length} passed (${skipped} skipped) ===`,
  );
  if (failed.length) {
    failed.forEach((f) => console.error(`  ✗ ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
