/**
 * Inventory sounds, music, sprites, story text, and per-map things from a WAD.
 *
 * Usage: npx tsx scripts/audit-wad-content.ts [path/to/DOOM2.WAD]
 */
import fs from 'node:fs';
import path from 'node:path';

import { buildWadAssetCatalog, formatCatalogSummary } from '../src/wad/catalog/wadAssetCatalog';
import { loadWadFromArrayBuffer } from '../src/wad/parser/loadWadFromArrayBuffer';

const wadPath = process.argv[2] ?? path.resolve(process.cwd(), 'public/wads/DOOM2.WAD');

function main(): void {
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const catalog = buildWadAssetCatalog(wad);

  console.log(formatCatalogSummary(catalog));
  console.log('');

  console.log('--- Story text ---');
  for (const story of catalog.storyTexts) {
    console.log(`${story.lumpName}: ${story.screenCount} screen(s)`);
    if (story.preview) console.log(`  ${story.preview}…`);
  }

  console.log('\n--- Music (first 10) ---');
  for (const track of catalog.music.slice(0, 10)) {
    console.log(`  ${track.name} ${track.byteLength} bytes ${track.isMus ? 'MUS' : '?'}`);
  }
  if (catalog.music.length > 10) {
    console.log(`  … and ${catalog.music.length - 10} more`);
  }

  console.log('\n--- Sounds by category ---');
  const byCat = new Map<string, number>();
  for (const s of catalog.sounds) {
    byCat.set(s.category, (byCat.get(s.category) ?? 0) + 1);
  }
  for (const [cat, count] of [...byCat.entries()].sort()) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log('\n--- Sample map: things ---');
  const sample = catalog.maps.find((m) => m.mapName === 'MAP01') ?? catalog.maps[0];
  if (sample) {
    console.log(`  ${sample.mapName} music: ${sample.musicLumpPresent ?? 'missing'}`);
    for (const row of sample.thingTypes.slice(0, 12)) {
      console.log(
        `  type ${row.type} x${row.count} ${row.description ?? '?'} sprite=${row.sprite ?? '-'}`
      );
    }
  }
}

main();
