#!/usr/bin/env npx tsx
import { extractGzdoomView, loadPng } from '../../src/wad/parity/frame/frameDiff.ts';

const path = process.argv[2]!;
const x = Number(process.argv[3]);
const y = Number(process.argv[4]);

const img = await loadPng(path);
const i640 = (y * img.width + x) * 4;
console.log(`640x480 (${x},${y}) rgb=${img.data[i640]},${img.data[i640 + 1]},${img.data[i640 + 2]}`);

const view = extractGzdoomView(img.data, img.width, img.height);
const vx = x;
const vy = y;
if (vx < view.width && vy < view.height) {
  const iv = (vy * view.width + vx) * 4;
  console.log(`view ${view.width}x${view.height} (${vx},${vy}) rgb=${view.data[iv]},${view.data[iv + 1]},${view.data[iv + 2]}`);
}
