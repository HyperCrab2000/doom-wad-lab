import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildBspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';
import { hwCheckClip } from '@/wad/renderer/bsp/hwCheckClip';
import { doomAngleToYaw } from '@/wad/renderer/controls/playerView';

describe('hwCheckClip', () => {
  it('does not clip MAP01 toxic pit pillars when back ceiling meets front floor without top texture', () => {
    const map = loadMap01();
    const line = map.LINEDEFS[348];
    const side = line.sidenum[0];
    const front = map.SIDEDEFS[side].sector;
    const back = map.SIDEDEFS[line.sidenum[1]].sector;

    // GZDoom hw_CheckClip: bs_ceil <= fs_floor but no valid top texture → no clip range.
    expect(
      hwCheckClip(map, 348, side, front, back)
    ).toBe(false);
  });

  it('does not clip open sky windows at equal ceiling height without textures', () => {
    const map = {
      SECTORS: [
        { floorheight: 0, ceilingheight: 128, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1', lightlevel: 255, type: 0, tag: 0 },
        { floorheight: 0, ceilingheight: 128, floorpic: 'FLOOR0_1', ceilingpic: 'F_SKY1', lightlevel: 255, type: 0, tag: 0 },
      ],
      SIDEDEFS: [
        { xOffset: 0, yOffset: 0, topTexture: '-', bottomTexture: '-', midTexture: '-', sector: 0 },
        { xOffset: 0, yOffset: 0, topTexture: '-', bottomTexture: '-', midTexture: '-', sector: 1 },
      ],
      LINEDEFS: [
        {
          v1: 0,
          v2: 1,
          special: 0,
          sidenum: [0, 1],
          flags: { twoSided: true },
        },
      ],
    } as never;

    expect(hwCheckClip(map, 0, 0, 0, 1)).toBe(false);
  });

  it('does not clip sky courtyard step between start room and toxic courtyard at equal ceiling', () => {
    const map = loadE1M1();
    expect(hwCheckClip(map, 160, map.LINEDEFS[160].sidenum[0], 0, 1)).toBe(false);
  });

  it('limits MAP01 BSP visibility from the player start facing east', () => {
    const map = loadMap01();
    const index = buildBspRenderIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;

    const visible = buildBspVisibleSet({
      map,
      index,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw: doomAngleToYaw(90),
    });

    expect(visible.wallDrawOrder.length).toBeGreaterThan(3);
    expect(visible.flatSectorOrder.length).toBeGreaterThanOrEqual(3);
    expect(visible.visibleSectors.size).toBeLessThan(map.SECTORS.length);
  });
});

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

function loadMap01() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM2.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.MAP01;
}
