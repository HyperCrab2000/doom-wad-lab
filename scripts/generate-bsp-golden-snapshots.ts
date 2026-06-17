import fs from 'node:fs';
import path from 'node:path';

import {
  hashBspSnapshot,
  snapshotFromBspVisible,
  type BspGoldenCatalog,
  type BspSnapshot,
} from '@/wad/renderer/bsp/vanilla/bspSnapshotHash';
import {
  buildVanillaBspView,
  listIwadMaps,
  loadWadMap,
  playerStartView,
  preloadAllIwadMaps,
  runVanillaBspVisible,
} from '@/wad/renderer/bsp/vanilla/vanillaBspHarness';

/** Frozen BSP outputs — regenerate with `npx tsx scripts/generate-bsp-golden-snapshots.ts`. */
export type { BspGoldenCatalog } from '@/wad/renderer/bsp/vanilla/bspSnapshotHash';

const E1M1_COURTYARD_VIEWS: Array<{ key: string; x: number; y: number; yawDeg: number }> = [
  { key: 'window43-south', x: -192, y: -3128, yawDeg: 180 },
  { key: 'window43-east', x: -192, y: -3128, yawDeg: 90 },
  { key: 'courtyard-center-n', x: -2624, y: -2848, yawDeg: 180 },
  { key: 'courtyard-center-e', x: -2624, y: -2848, yawDeg: 90 },
  { key: 'spawn', x: -896, y: -3616, yawDeg: 90 },
];

function catalogKey(wadName: string, mapName: string): string {
  return `${wadName}/${mapName}`;
}

export function buildBspGoldenCatalog(): BspGoldenCatalog {
  preloadAllIwadMaps();

  const spawn: BspGoldenCatalog['spawn'] = {};
  for (const mapRef of listIwadMaps()) {
    const start = playerStartView(loadWadMap(mapRef.wadName, mapRef.mapName));
    const view = buildVanillaBspView(mapRef, start.viewX, start.viewY, start.viewYaw);
    const visible = runVanillaBspVisible(view);
    const snapshot = snapshotFromBspVisible(visible);
    spawn[catalogKey(mapRef.wadName, mapRef.mapName)] = {
      hash: hashBspSnapshot(snapshot),
      snapshot,
    };
  }

  const e1m1Courtyard: BspGoldenCatalog['e1m1Courtyard'] = {};
  const e1m1Ref = { wadName: 'DOOM.WAD', mapName: 'E1M1' };
  for (const entry of E1M1_COURTYARD_VIEWS) {
    const view = buildVanillaBspView(
      e1m1Ref,
      entry.x,
      entry.y,
      (entry.yawDeg * Math.PI) / 180
    );
    const visible = runVanillaBspVisible(view);
    const snapshot = snapshotFromBspVisible(visible);
    e1m1Courtyard[entry.key] = {
      hash: hashBspSnapshot(snapshot),
      snapshot,
    };
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    spawn,
    e1m1Courtyard,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const catalog = buildBspGoldenCatalog();
  const outPath = path.resolve(
    process.cwd(),
    'src/wad/renderer/bsp/vanilla/bspGoldenSnapshots.json'
  );
  fs.writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(catalog.spawn).length} spawn + ${Object.keys(catalog.e1m1Courtyard).length} E1M1 courtyard snapshots to ${outPath}`);
}
