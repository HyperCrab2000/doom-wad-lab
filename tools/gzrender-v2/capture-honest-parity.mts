#!/usr/bin/env npx tsx
/** Capture one map via headless parity-capture.html (honest WebGL, no dev UI). */
import fs from 'node:fs';
import path from 'node:path';

import { resolvePlayableWadPath } from '../../src/wad/parity/frame/goldIwad.ts';
import {
  captureHonestParityFrame,
  ensureParityServer,
  launchParityBrowser,
  prepareParityPage,
  stopParityPreviewServer,
} from './lib/parityHarness.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MAP = process.argv[2] ?? 'E1M1';
const OUT =
  process.argv[3] ??
  path.join(ROOT, 'artifacts/gzrender-v2/honest-parity', `${MAP}.png`);

async function main(): Promise<void> {
  const baseUrl = await ensureParityServer();
  const browser = await launchParityBrowser();
  try {
    const page = await browser.newPage();
    await prepareParityPage(page);
    const wadPath = resolvePlayableWadPath(MAP);
    const png = await captureHonestParityFrame(page, baseUrl, MAP, wadPath);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, png);
    console.log(`Honest parity capture: ${OUT} (${png.length} bytes)`);
  } finally {
    await browser.close();
    stopParityPreviewServer();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
