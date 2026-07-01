#!/usr/bin/env npx tsx
/**
 * Scan gold-standard frames for "blue in WASM but not in native" — i.e. liquid (green nukage)
 * rendering blue in the WASM GLES path. Pure diagnostic, reads pre-captured PNGs only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage, type Image } from 'canvas';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');

async function rgbaOf(file: string): Promise<{ w: number; h: number; d: Uint8ClampedArray } | null> {
  if (!fs.existsSync(file)) return null;
  const img: Image = await loadImage(file);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  return { w: width, h: height, d: data as unknown as Uint8ClampedArray };
}

// Count pixels that are strongly blue (b dominates r and g) in the lower playfield region.
function blueCount(buf: { w: number; h: number; d: Uint8ClampedArray }): number {
  const { w, h, d } = buf;
  let n = 0;
  const y0 = Math.floor(h * 0.45);
  const y1 = Math.floor(h * 0.82); // avoid status bar
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
      if (b > 70 && b > r + 35 && b > g + 25) n++;
    }
  }
  return n;
}

async function main() {
  const rows: { map: string; nativeBlue: number; wasmBlue: number; delta: number }[] = [];
  for (const iwad of fs.existsSync(GOLD) ? fs.readdirSync(GOLD) : []) {
    const iwadDir = path.join(GOLD, iwad);
    if (!fs.statSync(iwadDir).isDirectory()) continue;
    for (const map of fs.readdirSync(iwadDir)) {
      const dir = path.join(iwadDir, map);
      if (!fs.statSync(dir).isDirectory()) continue;
      const nat = await rgbaOf(path.join(dir, 'ref.png'));
      const was = await rgbaOf(path.join(dir, 'ref-wasm.png'));
      if (!nat || !was) continue;
      const nb = blueCount(nat);
      const wb = blueCount(was);
      rows.push({ map: `${iwad}/${map}`, nativeBlue: nb, wasmBlue: wb, delta: wb - nb });
    }
  }
  rows.sort((a, b) => b.delta - a.delta);
  console.log('Top maps where WASM has blue that native does NOT (green→blue liquid suspects):');
  for (const r of rows.slice(0, 15)) {
    console.log(`  ${r.map.padEnd(14)} native=${String(r.nativeBlue).padStart(6)} wasm=${String(r.wasmBlue).padStart(6)} delta=${r.delta}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
