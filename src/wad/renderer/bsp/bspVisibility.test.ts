import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildBspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';
import { BspClipper, angleToPseudoAngle } from '@/wad/renderer/bsp/bspClipper';

describe('bspClipper', () => {
  it('blocks the rear hemisphere after frustum seed', () => {
    const clipper = new BspClipper();
    clipper.seedFromViewYaw(0);
    // Facing east: rear is west; south/north pseudo angles sit outside the forward cone.
    expect(clipper.safeCheckRange(angleToPseudoAngle(Math.PI / 2), angleToPseudoAngle(Math.PI / 2) + 0.01)).toBe(false);
    expect(clipper.safeCheckRange(angleToPseudoAngle(0), angleToPseudoAngle(0) + 0.01)).toBe(true);
  });

  it('seeds a forward cone at cardinal spawn angles (E1M1 faces south)', () => {
    const clipper = new BspClipper();
    clipper.seedFromViewYaw(Math.PI / 2);
    expect(clipper.safeCheckRange(0.49, 0.51)).toBe(true);
    expect(clipper.safeCheckRange(0.875, 0.05)).toBe(false);
  });

  it('subtracts solid wall spans from visibility', () => {
    const clipper = new BspClipper();
    clipper.seedFromViewYaw(0, Math.PI / 2);
    clipper.safeAddClipRange(0, 0.2);
    expect(clipper.safeCheckRange(0.05, 0.1)).toBe(false);
    expect(clipper.safeCheckRange(0.21, 0.22)).toBe(true);
  });
});

describe('buildBspVisibleSet', () => {
  it('marks fewer E1M1 sectors visible than the full map from the player start', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;

    const visible = buildBspVisibleSet({
      map,
      index,
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw: (playerStart.angle * Math.PI) / 180,
    });

    expect(visible.cameraSectorIndex).toBeGreaterThanOrEqual(0);
    expect(visible.wallDrawOrder.length).toBeGreaterThan(10);
    expect(visible.flatSubsectorOrder.length).toBeGreaterThan(5);
    expect(visible.visibleLineIndices.has(37)).toBe(true);
    expect(visible.visibleSectors.size).toBeLessThan(map.SECTORS.length);
    expect(visible.visibleSectors.has(70)).toBe(false);
  });

  it('shows courtyard window rooms from the outdoor courtyard without flooding the map', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const bounds = index.subsectorToSector.map((_, i) => i);
    void bounds;
    const sector42Bounds = buildSectorVisibilityBounds(map, 42);
    const cx = (sector42Bounds.minX + sector42Bounds.maxX) / 2;
    const cy = (sector42Bounds.minY + sector42Bounds.maxY) / 2;

    const visible = buildBspVisibleSet({
      map,
      index,
      viewX: cx,
      viewY: cy,
      viewYaw: Math.PI,
    });

    expect(visible.visibleSectors.has(42)).toBe(true);
    expect(visible.visibleSectors.has(70)).toBe(false);
    expect(visible.wallDrawOrder.length).toBeGreaterThanOrEqual(6);
  });

  it('shows secret courtyard from E1M1 window room without hangar outdoor leak', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;

    const visible = buildBspVisibleSet({
      map,
      index,
      viewX: -192,
      viewY: -3128,
      viewYaw: Math.PI,
    });

    const sector42Subs = visible.flatSubsectorOrder.filter(
      (sub) => index.subsectorToSector[sub] === 42
    );
    const sector0Subs = visible.flatSubsectorOrder.filter(
      (sub) => index.subsectorToSector[sub] === 0
    );
    expect(sector42Subs.length).toBeGreaterThan(0);
    expect(visible.visibleSectors.has(42)).toBe(true);
    expect(sector0Subs.length).toBe(0);
  });
});

function buildSectorVisibilityBounds(map: ReturnType<typeof loadE1M1>, sectorIndex: number) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const line of map.LINEDEFS) {
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      if (map.SIDEDEFS[sideIndex].sector !== sectorIndex) continue;
      const v1 = map.VERTEXES[line.v1];
      const v2 = map.VERTEXES[line.v2];
      minX = Math.min(minX, v1.x, v2.x);
      maxX = Math.max(maxX, v1.x, v2.x);
      minY = Math.min(minY, v1.y, v2.y);
      maxY = Math.max(maxY, v1.y, v2.y);
    }
  }
  return { minX, maxX, minY, maxY };
}

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}
