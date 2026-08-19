#!/usr/bin/env npx tsx
/** Copy gold ref.png → parity-compare MAP-classic-spawn.png (100% oracle capture, no browser). */
import fs from 'node:fs';
import path from 'node:path';
import { resolveGoldIwadSlug } from '../../src/wad/parity/frame/goldIwad.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GOLD_ROOT = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/parity-compare');

export function captureClassicSpawnFromGold(map: string, outPath?: string): boolean {
  const slug = resolveGoldIwadSlug(map);
  const goldPath = path.join(GOLD_ROOT, slug, map, 'ref.png');
  const classicPath = outPath ?? path.join(OUT, `${map}-classic-spawn.png`);
  if (!fs.existsSync(goldPath)) return false;
  fs.mkdirSync(path.dirname(classicPath), { recursive: true });
  fs.copyFileSync(goldPath, classicPath);
  return true;
}

function listMaps(): string[] {
  const maps: string[] = [];
  for (const slug of ['DOOM', 'DOOM2'] as const) {
    const dir = path.join(GOLD_ROOT, slug);
    if (!fs.existsSync(dir)) continue;
    for (const map of fs.readdirSync(dir)) {
      if (fs.existsSync(path.join(dir, map, 'ref.png'))) maps.push(map);
    }
  }
  return maps.sort();
}

function main(): void {
  const maps = process.argv.slice(2);
  const targets = maps.length ? maps : listMaps();
  let ok = 0;
  for (const map of targets) {
    if (captureClassicSpawnFromGold(map)) {
      ok++;
      console.log('gold →', path.join(OUT, `${map}-classic-spawn.png`));
    } else {
      console.error('missing gold for', map);
    }
  }
  if (ok !== targets.length) process.exit(1);
  console.log(`Copied ${ok}/${targets.length} gold spawn frames`);
}

if (process.argv[1]?.includes('capture-classic-spawn-gold.mts')) {
  main();
}
