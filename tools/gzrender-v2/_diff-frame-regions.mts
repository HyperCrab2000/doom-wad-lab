#!/usr/bin/env tsx
import { diffRgbaBuffers, loadPng } from '../../src/wad/parity/frame/frameDiff.ts';

const map = process.argv[2] ?? 'E1M1';
const root = new URL('../..', import.meta.url).pathname;
const classic = await loadPng(`${root}/artifacts/gzrender-v2/parity-compare/${map}-classic-spawn.png`);
const gold = await loadPng(`${root}/artifacts/gzrender-v2/gold-standard/DOOM/${map}/ref.png`);

for (const region of [
  { name: 'full', x: 0, y: 0, w: 640, h: 480 },
  { name: 'top403', x: 0, y: 0, w: 640, h: 403 },
  { name: 'band77', x: 0, y: 403, w: 640, h: 77 },
  { name: 'band64', x: 0, y: 416, w: 640, h: 64 },
  { name: 'left160', x: 0, y: 403, w: 160, h: 77 },
  { name: 'center320', x: 160, y: 403, w: 320, h: 77 },
  { name: 'face-zone', x: 160, y: 355, w: 80, h: 125 },
]) {
  const d = diffRgbaBuffers(
    classic.data,
    gold.data,
    classic.width,
    classic.height,
    { x: region.x, y: region.y, width: region.w, height: region.h },
    8,
  );
  console.log(
    `${region.name}: ${(d.mismatchRatio * 100).toFixed(2)}% (${d.mismatchCount}/${region.w * region.h}) mean=${d.meanAbsDelta.toFixed(2)}`,
  );
}
