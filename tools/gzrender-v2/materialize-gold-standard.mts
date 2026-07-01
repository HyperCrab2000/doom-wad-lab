#!/usr/bin/env npx tsx
/**
 * Materialize canonical gold-standard tree from import-oracle artifacts (68/68).
 * Copies ref.gzstate → gzdoom.gzstate, ref.png → ref.png per map.
 *
 * Usage: npx tsx tools/gzrender-v2/materialize-gold-standard.mts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const IMPORT = path.join(ROOT, 'artifacts/gzrender-v2/import-oracle');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');

const IWADS = ['DOOM', 'DOOM2'] as const;

function copyIfExists(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function main(): void {
  let maps = 0;
  let missing = 0;
  const manifest: Array<{ map: string; gzstateBytes: number; frameBytes: number }> = [];

  for (const slug of IWADS) {
    const srcDir = path.join(IMPORT, slug);
    const dstDir = path.join(GOLD, slug);
    if (!fs.existsSync(srcDir)) {
      console.warn(`skip missing ${srcDir}`);
      continue;
    }
    for (const map of fs.readdirSync(srcDir)) {
      if (map === 'summary.json') continue;
      const mapSrc = path.join(srcDir, map);
      if (!fs.statSync(mapSrc).isDirectory()) continue;
      const gzOk = copyIfExists(path.join(mapSrc, 'ref.gzstate'), path.join(dstDir, map, 'gzdoom.gzstate'));
      const pngOk = copyIfExists(path.join(mapSrc, 'ref.png'), path.join(dstDir, map, 'ref.png'));
      if (!gzOk || !pngOk) {
        missing++;
        console.warn(`incomplete: ${slug}/${map}`);
        continue;
      }
      maps++;
      manifest.push({
        map: `${slug}/${map}`,
        gzstateBytes: fs.statSync(path.join(dstDir, map, 'gzdoom.gzstate')).size,
        frameBytes: fs.statSync(path.join(dstDir, map, 'ref.png')).size,
      });
    }
    fs.writeFileSync(
      path.join(dstDir, 'manifest.json'),
      JSON.stringify(
        {
          iwad: slug,
          source: 'gzdoom-native-import-oracle',
          flags: ['-gzrender_only', '-dumpgzstate', '-gzstate_refframe'],
          maps: manifest.filter((m) => m.map.startsWith(`${slug}/`)).length,
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  fs.writeFileSync(
    path.join(GOLD, 'manifest.json'),
    JSON.stringify({ totalMaps: maps, missing, generatedAt: new Date().toISOString(), maps: manifest }, null, 2),
  );
  console.log(`Gold standard: ${maps} maps materialized, ${missing} incomplete → ${GOLD}`);
  if (missing > 0) process.exit(1);
}

main();
