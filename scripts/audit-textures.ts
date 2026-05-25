/**
 * Audit wall/flat texture coverage across all maps in a WAD.
 *
 * Usage: npx tsx scripts/audit-textures.ts [path/to/DOOM.WAD]
 */
import fs from 'node:fs';
import path from 'node:path';

import { skyFlats } from '../src/wad/constants/WadInfo';
import { collectMapWallAndFlatNames } from '../src/wad/renderer/drawAssets/collectMapAssets';
import { loadWadFromArrayBuffer } from '../src/wad/parser/loadWadFromArrayBuffer';

const wadPath = process.argv[2] ?? path.resolve(process.cwd(), 'public/wads/DOOM.WAD');

function main(): void {
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const mapNames = Object.keys(wad.maps).sort();

  let totalWalls = 0;
  let totalFlats = 0;
  let wallsMissingLump = 0;
  let flatsMissingLump = 0;

  const missingWallByName = new Map<string, string[]>();
  const missingFlatByName = new Map<string, string[]>();

  for (const mapName of mapNames) {
    const map = wad.maps[mapName];
    if (!map) continue;

    const { wallNames, flatNames } = collectMapWallAndFlatNames(wad, map, mapName);

    for (const name of wallNames) {
      totalWalls++;
      const key = name.toUpperCase();
      if (!wad.textures[name] && !wad.textures[key]) {
        wallsMissingLump++;
        const list = missingWallByName.get(name) ?? [];
        list.push(mapName);
        missingWallByName.set(name, list);
      }
    }

    for (const name of flatNames) {
      if (skyFlats.includes(name)) continue;
      totalFlats++;
      const key = name.toUpperCase();
      if (!wad.flats[name] && !wad.flats[key]) {
        flatsMissingLump++;
        const list = missingFlatByName.get(name) ?? [];
        list.push(mapName);
        missingFlatByName.set(name, list);
      }
    }
  }

  console.log(`WAD: ${wadPath}`);
  console.log(`Maps: ${mapNames.length}`);
  console.log('');
  console.log(`Wall texture references: ${totalWalls}`);
  console.log(`  missing WAD lump: ${wallsMissingLump}`);
  console.log(`Flat texture references: ${totalFlats}`);
  console.log(`  missing WAD lump: ${flatsMissingLump}`);
  console.log('');
  console.log('Parallax relief: procedural from texture art when no PNG at public/materials/heightTex/');
  console.log('Thing voxels: require KVX files at public/voxels/ (repo ships README only)');

  const printTop = (title: string, map: Map<string, string[]>, limit = 12) => {
    if (map.size === 0) return;
    console.log(`\n${title} (top ${limit}):`);
    [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, limit)
      .forEach(([name, maps]) => console.log(`  ${name}: ${maps.length} maps`));
  };

  printTop('Walls missing lump', missingWallByName);
  printTop('Flats missing lump', missingFlatByName);

  if (wallsMissingLump > 0 || flatsMissingLump > 0) {
    process.exitCode = 1;
  }
}

main();
