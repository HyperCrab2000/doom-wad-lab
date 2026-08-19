import type { Page } from 'puppeteer';

/** Wait until Classic WebGL finished load + melt wipe and canvas is presenting. */
export async function waitClassicPlaying(page: Page, timeoutMs = 180_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const viewer = document.querySelector('.level-viewer');
      const canvas = document.querySelector('canvas.game-canvas');
      return (
        viewer?.getAttribute('data-map-load-state') === 'ready' &&
        viewer?.getAttribute('data-is-playing') === 'true' &&
        canvas != null &&
        !canvas.classList.contains('game-canvas--hidden')
      );
    },
    { timeout: timeoutMs, polling: 300 },
  );
}
