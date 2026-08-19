import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '@/wad/parity/frame/frameDiff';

const ROOT = path.resolve(process.cwd(), 'artifacts/gzrender-v2');
const CLASSIC = path.join(ROOT, 'parity-compare/E1M1-classic-spawn.png');
const GOLD = path.join(ROOT, 'gold-standard/DOOM/E1M1/ref.png');

async function loadPlayfield(pngPath: string) {
  const img = await loadPng(pngPath);
  const view = extractGzdoomView(img.data, img.width, img.height);
  return resizePlayfieldToVanilla(view.data, view.width, view.height);
}

function rgb(data: Uint8Array, x: number, y: number): [number, number, number] {
  const i = (y * 320 + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
}

function delta(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

describe('parity bucket hotspots', () => {
  it('lists worst mismatches per bucket vs gold', async () => {
    if (!fs.existsSync(CLASSIC) || !fs.existsSync(GOLD)) return;
    const classic = await loadPlayfield(CLASSIC);
    const gold = await loadPlayfield(GOLD);

    for (const [name, y0, y1] of [
      ['ceiling', 0, 42],
      ['mid-upper', 42, 84],
      ['mid-lower', 84, 126],
      ['floor', 126, 168],
    ] as const) {
      const hot: Array<{ x: number; y: number; d: number; g: string; c: string }> = [];
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < 320; x++) {
          const g = rgb(gold.data, x, y);
          const c = rgb(classic.data, x, y);
          const d = delta(g, c);
          if (d <= 8) continue;
          hot.push({ x, y, d, g: g.join(','), c: c.join(',') });
        }
      }
      hot.sort((a, b) => b.d - a.d);
      console.log(`\n${name} top mismatches:`);
      for (const h of hot.slice(0, 6)) {
        console.log(`  (${h.x},${h.y}) d=${h.d} gold=${h.g} classic=${h.c}`);
      }
    }
    expect(true).toBe(true);
  });
});
