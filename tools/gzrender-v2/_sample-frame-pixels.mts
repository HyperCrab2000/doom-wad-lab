#!/usr/bin/env tsx
import { loadPng } from '../../src/wad/parity/frame/frameDiff.ts';

async function main(): Promise<void> {
  const map = process.argv[2] ?? 'E1M1';
  const root = new URL('../..', import.meta.url).pathname;
  const classic = await loadPng(`${root}/artifacts/gzrender-v2/parity-compare/${map}-classic-spawn.png`);
  const gold = await loadPng(`${root}/artifacts/gzrender-v2/gold-standard/DOOM/${map}/ref.png`);

  function px(img: Awaited<ReturnType<typeof loadPng>>, x: number, y: number): string {
    const i = (y * img.width + x) * 4;
    return `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`;
  }

  const probes: Array<[number, number, string]> = [
    [320, 450, 'status center'],
    [320, 430, 'status upper'],
    [180, 420, 'face area'],
    [80, 450, 'ammo left'],
    [520, 450, 'ammo right'],
    [0, 240, 'left letterbox'],
    [639, 240, 'right letterbox'],
    [320, 200, 'playfield center'],
    [320, 380, 'playfield bottom'],
  ];

  console.log('| x | y | label | classic | gold |');
  console.log('|---|---|-------|---------|------|');
  for (const [x, y, label] of probes) {
    console.log(`| ${x} | ${y} | ${label} | ${px(classic, x, y)} | ${px(gold, x, y)} |`);
  }
}

main();
