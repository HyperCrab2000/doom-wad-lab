#!/usr/bin/env npx tsx
/**
 * Enumerate view probes for GZDRAW / multi-probe corpus testing.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/enumerate-view-probes.mts [iwad] [--map E1M1] [--jsonl]
 *
 * Default output: JSON array. --jsonl emits one probe per line.
 */
import fs from 'node:fs';
import path from 'node:path';

import { discoverMapNames, loadWadFromArrayBuffer } from '@hypercrab2000/doom-wad-core';

import {
  DOOM1_WAD,
  DOOM2_WAD,
  enumerateSectorProbes,
  loadWadMap,
  playerStartView,
} from '../../src/wad/renderer/bsp/vanilla/vanillaBspHarness.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CARDINAL_YAW_DEG = [0, 90, 180, 270] as const;

export interface ViewProbeRecord {
  map: string;
  sectorIndex: number;
  viewX: number;
  viewY: number;
  yawDeg: number;
  probeId: number;
  kind: 'spawn' | 'sector';
}

function parseArgs(argv: string[]) {
  let iwad = path.join(ROOT, 'public/wads/DOOM.WAD');
  let mapFilter: string | undefined;
  let jsonLines = false;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--map') mapFilter = argv[++i]?.trim().toUpperCase();
    else if (arg === '--jsonl') jsonLines = true;
    else if (!arg.startsWith('-')) iwad = path.resolve(arg);
  }
  return { iwad, mapFilter, jsonLines };
}

function iwadFileName(iwadPath: string): string {
  const base = path.basename(iwadPath).toUpperCase();
  if (base === DOOM1_WAD || base === DOOM2_WAD) return base;
  return base.endsWith('.WAD') ? base : `${base}.WAD`;
}

function doomYawDegFromRadians(radians: number): number {
  const deg = Math.round((radians * 180) / Math.PI) % 360;
  return deg < 0 ? deg + 360 : deg;
}

export function enumerateViewProbesForMap(wadName: string, mapName: string): ViewProbeRecord[] {
  const mapRef = { wadName, mapName };
  const map = loadWadMap(wadName, mapName);
  const start = playerStartView(map);
  const probes: ViewProbeRecord[] = [];
  let probeId = 0;

  probes.push({
    map: mapName,
    sectorIndex: -1,
    viewX: start.viewX,
    viewY: start.viewY,
    yawDeg: doomYawDegFromRadians(start.viewYaw),
    probeId: probeId++,
    kind: 'spawn',
  });

  for (const sectorProbe of enumerateSectorProbes(mapRef)) {
    for (const yawDeg of CARDINAL_YAW_DEG) {
      probes.push({
        map: mapName,
        sectorIndex: sectorProbe.sectorIndex,
        viewX: sectorProbe.viewX,
        viewY: sectorProbe.viewY,
        yawDeg,
        probeId: probeId++,
        kind: 'sector',
      });
    }
  }

  return probes;
}

function main(): void {
  const { iwad, mapFilter, jsonLines } = parseArgs(process.argv);
  if (!fs.existsSync(iwad)) {
    console.error(`IWAD not found: ${iwad}`);
    process.exit(1);
  }

  const wadName = iwadFileName(iwad);
  const buf = fs.readFileSync(iwad);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  let maps = discoverMapNames(wad).sort();
  if (mapFilter) {
    if (!maps.includes(mapFilter)) {
      console.error(`Map ${mapFilter} not in ${path.basename(iwad)}`);
      process.exit(1);
    }
    maps = [mapFilter];
  }

  const allProbes: ViewProbeRecord[] = [];
  for (const mapName of maps) {
    allProbes.push(...enumerateViewProbesForMap(wadName, mapName));
  }

  if (jsonLines) {
    for (const probe of allProbes) {
      console.log(JSON.stringify(probe));
    }
  } else {
    console.log(JSON.stringify(allProbes, null, 2));
  }

  const mapLabel = mapFilter ?? `${maps.length} maps`;
  console.error(`${allProbes.length} probes (${mapLabel}, ${path.basename(iwad)})`);
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isMain) {
  main();
}
