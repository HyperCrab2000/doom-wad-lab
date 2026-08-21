#!/usr/bin/env npx tsx
import { loadPng, diffRgbaBuffers } from '../../src/wad/parity/frame/frameDiff.ts';
import { computeHudLayout } from '../../src/features/level-viewer/doomHudLayout.ts';

async function main(): Promise<void> {
  const classic = await loadPng('artifacts/gzrender-v2/honest-parity/E1M1.png');
  const gold = await loadPng('artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png');
  const layout = computeHudLayout(640, 480);
  const hudTop = 480 - layout.canvasHeight;
  console.log('hud layout', layout);
  console.log('hudTop', hudTop, 'canvasHeight', layout.canvasHeight);
  console.log('STBAR y in frame', hudTop + layout.barY, '-', hudTop + layout.canvasHeight);

  const hud = diffRgbaBuffers(classic.data, gold.data, 640, 480, { x: 0, y: 403, width: 640, height: 77 }, 8);
  console.log('hud 403-480 mismatch', (hud.mismatchRatio * 100).toFixed(2) + '%');

  for (const y of [355, 380, 400, 403, 410, 416, 448]) {
    const d = diffRgbaBuffers(classic.data, gold.data, 640, 480, { x: 0, y, width: 640, height: 32 }, 8);
    console.log(`strip y=${y} h=32`, (d.mismatchRatio * 100).toFixed(2) + '%');
  }

  // Sample center pixel row 450
  const row = 450;
  let classicNonBlack = 0;
  let goldNonBlack = 0;
  for (let x = 0; x < 640; x++) {
    const ci = (row * 640 + x) * 4;
    const gi = ci;
    if (classic.data[ci]! + classic.data[ci + 1]! + classic.data[ci + 2]! > 0) classicNonBlack++;
    if (gold.data[gi]! + gold.data[gi + 1]! + gold.data[gi + 2]! > 0) goldNonBlack++;
  }
  console.log(`row ${row}: classic non-black ${classicNonBlack}, gold ${goldNonBlack}`);
}

main();
