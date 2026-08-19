#!/usr/bin/env tsx
/**
 * Offline spawn capture — CPU software renderer (procedural parity, no browser/WebGL).
 * Writes artifacts/gzrender-v2/parity-compare/{MAP}-classic-spawn.png (640×480).
 */
import { installNodeCanvasDocument } from './lib/nodeCanvasDocument.ts';
installNodeCanvasDocument();

import path from 'node:path';

import { captureClassicSpawnOffline } from './lib/spawnOfflineCapture.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MAP = process.argv[2] ?? 'E1M1';
const OUT =
  process.argv[3] ??
  path.join(ROOT, 'artifacts/gzrender-v2/parity-compare', `${MAP}-classic-spawn.png`);

const result = captureClassicSpawnOffline(MAP, OUT);
console.log(`Wrote ${result.outPath}`);
console.log(
  `drawState walls=${result.walls} flats=${result.flats} sectors=${result.sectors}`,
);
