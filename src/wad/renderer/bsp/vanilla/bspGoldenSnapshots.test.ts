import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import goldenCatalog from '@/wad/renderer/bsp/vanilla/bspGoldenSnapshots.json';
import {
  hashBspSnapshot,
  snapshotFromBspVisible,
  type BspGoldenCatalog,
} from '@/wad/renderer/bsp/vanilla/bspSnapshotHash';
import {
  buildVanillaBspView,
  listIwadMaps,
  loadWadMap,
  playerStartView,
  preloadAllIwadMaps,
  runProductionMeshDrawState,
  runVanillaBspVisible,
} from '@/wad/renderer/bsp/vanilla/vanillaBspHarness';

const catalog = goldenCatalog as BspGoldenCatalog;

const HAS_STOCK_IWAD = fs.existsSync(path.join(process.cwd(), 'public/wads/DOOM.WAD'));

const E1M1_COURTYARD_VIEWS = [
  { key: 'window43-south', x: -192, y: -3128, yawDeg: 180 },
  { key: 'window43-east', x: -192, y: -3128, yawDeg: 90 },
  { key: 'courtyard-center-n', x: -2624, y: -2848, yawDeg: 180 },
  { key: 'courtyard-center-e', x: -2624, y: -2848, yawDeg: 90 },
  { key: 'spawn', x: -896, y: -3616, yawDeg: 90 },
] as const;

describe.skipIf(!HAS_STOCK_IWAD)('BSP golden snapshots (regression lock on RenderBSP output)', () => {
  beforeAll(() => {
    preloadAllIwadMaps();
  });

  it('catalog covers all 68 IWAD maps at player start', () => {
    expect(Object.keys(catalog.spawn).length).toBe(listIwadMaps().length);
  });

  it('matches frozen spawn hashes for every IWAD map', () => {
    const mismatches: string[] = [];

    for (const mapRef of listIwadMaps()) {
      const key = `${mapRef.wadName}/${mapRef.mapName}`;
      const expected = catalog.spawn[key];
      if (!expected) {
        mismatches.push(`${key}: missing from golden catalog`);
        continue;
      }

      const start = playerStartView(loadWadMap(mapRef.wadName, mapRef.mapName));
      const view = buildVanillaBspView(mapRef, start.viewX, start.viewY, start.viewYaw);
      const visible = runVanillaBspVisible(view);
      const hash = hashBspSnapshot(snapshotFromBspVisible(visible));

      if (hash !== expected.hash) {
        mismatches.push(`${key}: expected ${expected.hash}, got ${hash}`);
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });

  it('matches frozen E1M1 courtyard view hashes', () => {
    const mismatches: string[] = [];
    const e1m1Ref = { wadName: 'DOOM.WAD', mapName: 'E1M1' };

    for (const entry of E1M1_COURTYARD_VIEWS) {
      const expected = catalog.e1m1Courtyard[entry.key];
      expect(expected, `missing golden entry ${entry.key}`).toBeDefined();

      const view = buildVanillaBspView(
        e1m1Ref,
        entry.x,
        entry.y,
        (entry.yawDeg * Math.PI) / 180
      );
      const visible = runVanillaBspVisible(view);
      const hash = hashBspSnapshot(snapshotFromBspVisible(visible));

      if (hash !== expected!.hash) {
        mismatches.push(`${entry.key}: expected ${expected!.hash}, got ${hash}`);
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });

  it('E1M1 window43-south BSP flat sectors exclude hangar and sector 70', () => {
    const snap = catalog.e1m1Courtyard['window43-south']!.snapshot;
    const flatSectors = new Set<number>();
    const index = buildVanillaBspView(
      { wadName: 'DOOM.WAD', mapName: 'E1M1' },
      -192,
      -3128,
      Math.PI
    ).index;

    for (const subsectorIndex of snap.flatSubsectorOrder) {
      const sectorIndex = index.subsectorToSector[subsectorIndex] ?? -1;
      if (sectorIndex >= 0) flatSectors.add(sectorIndex);
    }

    expect(flatSectors.has(42)).toBe(true);
    expect(flatSectors.has(43)).toBe(true);
    expect(flatSectors.has(0)).toBe(false);
    expect(flatSectors.has(70)).toBe(false);
  });

  it('E1M1 player start and staircase see courtyard sky through windows (production BSP draw)', () => {
    const map = loadWadMap('DOOM.WAD', 'E1M1');
    const index = buildVanillaBspView(
      { wadName: 'DOOM.WAD', mapName: 'E1M1' },
      0,
      0,
      0
    ).index;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;

    const startView = buildVanillaBspView(
      { wadName: 'DOOM.WAD', mapName: 'E1M1' },
      playerStart.x,
      playerStart.y,
      (playerStart.angle * Math.PI) / 180
    );
    const startDraw = runProductionMeshDrawState(startView)!;
    expect(startDraw.flatSupplementSectorOrder).toContain(42);

    const stairView = buildVanillaBspView(
      { wadName: 'DOOM.WAD', mapName: 'E1M1' },
      -1664,
      -3072,
      Math.PI / 2
    );
    const stairDraw = runProductionMeshDrawState(stairView)!;
    expect(stairDraw.flatSupplementSectorOrder).toContain(42);
  });
});
