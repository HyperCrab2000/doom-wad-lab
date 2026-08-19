import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { mapToWallsForLine } from '@/wad/renderer/geometry/mapToWalls';

function loadMap28() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM2.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.MAP28;
}

function buildTextureLookup(map: ReturnType<typeof loadMap28>) {
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }
  const texturesByName: Record<string, { width: number; height: number; transparent: boolean }> = {};
  for (const name of texNames) {
    texturesByName[name] = { width: 64, height: 128, transparent: false };
  }
  texturesByName.BLAKWAL1 = { width: 64, height: 128, transparent: false };
  return texturesByName;
}

describe('MAP28 crusher-style doors', () => {
  it('drops upper walls when sector 115 opens (walk door tag 13)', () => {
    const map = loadMap28();
    const texturesByName = buildTextureLookup(map);

  const closedCounts = [712, 713, 736, 737, 738].map((lineIndex) =>
      mapToWallsForLine(map, texturesByName, lineIndex).length
    );

    const openMap = structuredClone(map);
    openMap.SECTORS[115].ceilingheight = 128;

    const openCounts = [712, 713, 736, 737, 738].map((lineIndex) =>
      mapToWallsForLine(openMap, texturesByName, lineIndex).length
    );

    // Only the sidedef with the actual door texture creates geometry — GZDoom doesn't
    // render phantom walls on the back side that has '-' textures.
    expect(closedCounts.every((count) => count === 1)).toBe(true);
    expect(openCounts.every((count) => count === 0)).toBe(true);
  });

  it('drops upper walls when sector 99 openWaitClose door fully opens', () => {
    const map = loadMap28();
    const texturesByName = buildTextureLookup(map);

    expect(mapToWallsForLine(map, texturesByName, 455).length).toBe(2);
    expect(mapToWallsForLine(map, texturesByName, 551).length).toBe(1);

    const openMap = structuredClone(map);
    openMap.SECTORS[99].ceilingheight = 128;

    expect(mapToWallsForLine(openMap, texturesByName, 455).length).toBe(1);
    expect(mapToWallsForLine(openMap, texturesByName, 551).length).toBe(0);
  });
});
