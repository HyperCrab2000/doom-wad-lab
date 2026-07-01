#!/usr/bin/env tsx
import path from 'node:path';
import { loadImage, createCanvas } from 'canvas';

const ROOT = path.resolve(import.meta.dirname, '../..');
const file = process.argv[2] ?? path.join(ROOT, 'artifacts/gzrender-v2/blue-liquid/app-04.png');

const img = await loadImage(file);
const c = createCanvas(img.width, img.height);
const ctx = c.getContext('2d');
ctx.drawImage(img, 0, 0);
const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);

// Histogram the dominant blue pixels in the lower third (the liquid).
const hist = new Map<string, number>();
for (let y = Math.floor(height * 0.62); y < Math.floor(height * 0.95); y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    if (b > 70 && b > r + 35 && b > g + 25) {
      const key = `${Math.round(r / 16) * 16},${Math.round(g / 16) * 16},${Math.round(b / 16) * 16}`;
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
  }
}
console.log(`Top liquid blue RGB buckets in ${path.basename(file)}:`);
for (const [k, n] of [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  rgb(${k}) -> ${n}px`);
}
