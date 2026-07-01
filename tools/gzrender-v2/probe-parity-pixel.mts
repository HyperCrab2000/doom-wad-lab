#!/usr/bin/env npx tsx
/**
 * Offline parity probe: compare gold vs wasm (optional native) at playfield coords.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/probe-parity-pixel.mts E1M6 62 49
 *   npx tsx tools/gzrender-v2/probe-parity-pixel.mts E1M1 211 85 [/path/native.png]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';
import { gzdoomColormapIndex, shadePalIndex } from '../../src/wad/parity/frame/gzdoomColormap.ts';
import {
  gzdoomPlaneDepth,
  gzdoomViewport,
} from '../../src/wad/parity/frame/gzdoomScreenZ.ts';
import { doomAngleToYaw } from '../../src/wad/renderer/controls/playerView.ts';
import { loadWadFromArrayBuffer } from '../../src/wad/parser/loadWadFromArrayBuffer.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MAP = process.argv[2] ?? 'E1M6';
const PX = Number(process.argv[3] ?? 62);
const PY = Number(process.argv[4] ?? 49);
const NATIVE = process.argv[5];
const IWAD = MAP.startsWith('MAP') ? 'DOOM2.WAD' : 'DOOM.WAD';
const GOLD_SLUG = MAP.startsWith('MAP') ? 'DOOM2' : 'DOOM';

async function playfieldPixel(pngPath: string, x: number, y: number): Promise<number[]> {
  const img = await loadPng(pngPath);
  const view = extractGzdoomView(img.data, img.width, img.height);
  const pf = resizePlayfieldToVanilla(view.data, view.width, view.height);
  const i = (y * 320 + x) * 4;
  return [pf.data[i]!, pf.data[i + 1]!, pf.data[i + 2]!];
}

function playerStartFromWad(mapName: string): { x: number; y: number; angle: number } {
  const wad = loadWadFromArrayBuffer(fs.readFileSync(path.join(ROOT, 'public/wads', IWAD)).buffer);
  const map = wad.maps[mapName]!;
  const start = map.THINGS.find((t) => t.type === 1);
  if (!start) throw new Error(`no player start on ${mapName}`);
  return { x: start.x, y: start.y, angle: start.angle };
}

async function main(): Promise<void> {
  const goldPath = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard', GOLD_SLUG, MAP, 'ref.png');
  const wasmPath = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm', `${MAP}.png`);

  const gold = await playfieldPixel(goldPath, PX, PY);
  const wasm = await playfieldPixel(wasmPath, PX, PY);
  const native = NATIVE ? await playfieldPixel(NATIVE, PX, PY) : null;

  const start = playerStartFromWad(MAP);
  const yaw = doomAngleToYaw(start.angle);
  const vp = gzdoomViewport(640, 403, yaw);
  const screenX = PX * 2 + 1;
  const screenY = PY * 2 + 1;
  const eye = 41;
  const planeDepth = gzdoomPlaneDepth(screenY, eye, vp);

  console.log(`map=${MAP} playfield=(${PX},${PY}) screen≈(${screenX},${screenY})`);
  console.log(`player start: x=${start.x} y=${start.y} angle=${start.angle}`);
  console.log(`gold rgba:   ${gold.join(',')}`);
  console.log(`wasm rgba:   ${wasm.join(',')}`);
  if (native) console.log(`native rgba: ${native.join(',')}`);

  const wad = loadWadFromArrayBuffer(fs.readFileSync(path.join(ROOT, 'public/wads', IWAD)).buffer);
  const sectorLight = 160;
  for (const z of [planeDepth, planeDepth * 1.1, planeDepth * 0.9, 512, 1024]) {
    const band = gzdoomColormapIndex(sectorLight, 8 / z);
    const rgb = shadePalIndex(wad.playpal, wad.colormap, 0, sectorLight, 8 / z);
    console.log(`  z=${z.toFixed(1)} band=${band} pal0→${rgb.join(',')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
