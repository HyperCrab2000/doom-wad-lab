import type { Page } from 'puppeteer';

import { waitClassicPlaying } from './waitClassicPlaying.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Load Classic WebGL E1M1 through level chrome (matches current control-field UI). */
export async function loadClassicParityMap(
  page: Page,
  baseUrl: string,
  map: string,
  query: Record<string, string> = {},
): Promise<void> {
  const params = new URLSearchParams({
    renderer: 'classic',
    map,
    _: String(Date.now()),
    ...query,
  });
  await page.goto(`${baseUrl}/?${params.toString()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });

  await page.waitForSelector('.level-chrome__selects select', { timeout: 30_000 });

  const iwadSelect = await page.$('.level-chrome__selects .control-field__input:not(.control-field__input--map):not(.control-field__input--engine)');
  if (iwadSelect) {
    await iwadSelect.select('/wads/DOOM.WAD');
  } else {
    const fallback = await page.$('.level-chrome__selects select');
    if (fallback) await fallback.select('/wads/DOOM.WAD');
  }

  await page.waitForFunction(
    () => {
      const mapSelect = document.querySelector(
        '.control-field__input--map',
      ) as HTMLSelectElement | null;
      return mapSelect != null && !mapSelect.disabled && mapSelect.options.length >= 1;
    },
    { timeout: 180_000 },
  );

  await page.select('.control-field__input--map', map);
  await page.select('.control-field__input--engine', 'classic');
  await waitClassicPlaying(page);
}
