import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import {
  buildRejectVisibleSectors,
  intersectVisibleSectorSets,
  sectorsPotentiallyVisible,
} from '@/wad/renderer/utils/sectorRejectVisibility';
import { buildPotentiallyVisibleSectors, buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';

describe('sectorRejectVisibility', () => {
  it('marks fewer E1M1 sectors visible than the full map', () => {
    const map = loadE1M1();
    const visible = buildRejectVisibleSectors(map, 70)!;
    expect(visible.size).toBeLessThan(map.SECTORS.length);
    expect(visible.has(70)).toBe(true);
  });

  it('treats identical sectors as mutually visible', () => {
    const map = loadE1M1();
    const reject = new Uint8Array(map.REJECT);
    expect(sectorsPotentiallyVisible(reject, map.SECTORS.length, 70, 70)).toBe(true);
  });

  it('hides distant sectors from the E1M1 outdoor courtyard center', () => {
    const map = loadE1M1();
    const index = buildSectorVisibilityIndex(map)!;
    const courtyardSector = 40;

    const portalVisible = buildPotentiallyVisibleSectors(
      index,
      map,
      -2624,
      -2848,
      courtyardSector,
      4096
    );
    const rejectVisible = buildRejectVisibleSectors(map, courtyardSector)!;
    const combined = intersectVisibleSectorSets(portalVisible, rejectVisible, courtyardSector)!;

    expect(combined.has(courtyardSector)).toBe(true);
    expect(combined.has(70)).toBe(false);
    expect(combined.size).toBeLessThan(10);
  });

  it('does not flood distant indoor sectors from an E1M1 indoor doorway', () => {
    const map = loadE1M1();
    const index = buildSectorVisibilityIndex(map)!;
    const doorwaySector = 43;
    const bounds = index.sectorBounds[doorwaySector]!;
    const cameraX = (bounds.minX + bounds.maxX) / 2;
    const cameraY = (bounds.minY + bounds.maxY) / 2;

    const portalVisible = buildPotentiallyVisibleSectors(
      index,
      map,
      cameraX,
      cameraY,
      doorwaySector,
      4096
    );
    const rejectVisible = buildRejectVisibleSectors(map, doorwaySector)!;
    const combined = intersectVisibleSectorSets(portalVisible, rejectVisible, doorwaySector)!;

    expect(combined.has(doorwaySector)).toBe(true);
    expect(combined.has(70)).toBe(false);
    expect(combined.size).toBeLessThan(12);
  });

  it('shows adjacent window rooms from the E1M1 outdoor courtyard', () => {
    const map = loadE1M1();
    const index = buildSectorVisibilityIndex(map)!;
    const courtyardSector = 42;
    const bounds = index.sectorBounds[courtyardSector]!;
    const cameraX = (bounds.minX + bounds.maxX) / 2;
    const cameraY = (bounds.minY + bounds.maxY) / 2;

    const portalVisible = buildPotentiallyVisibleSectors(
      index,
      map,
      cameraX,
      cameraY,
      courtyardSector,
      4096
    );
    const rejectVisible = buildRejectVisibleSectors(map, courtyardSector)!;
    const combined = intersectVisibleSectorSets(portalVisible, rejectVisible, courtyardSector)!;

    expect(combined.has(courtyardSector)).toBe(true);
    expect(combined.has(43)).toBe(true);
    expect(combined.has(70)).toBe(false);
    expect(combined.size).toBeLessThan(12);
  });
});

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}
