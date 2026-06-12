import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { subsectorSignedArea, subsectorToTriangles } from '@/wad/renderer/geometry/subsectorToTriangles';

describe('subsector flats', () => {
  it('builds floor and ceiling spans for MAP01 subsectors', () => {
    const map = loadMap('DOOM2.WAD', 'MAP01');
    const index = buildBspRenderIndex(map)!;
    const flats = mapToSubsectorFlats(map, index);

    expect(flats.length).toBeGreaterThan(100);
    expect(flats.every((flat) => flat.subsectorIndex != null && flat.subsectorIndex >= 0)).toBe(true);
  });

  it('triangulates convex subsector segs with angular vertex order', () => {
    const map = loadMap('DOOM.WAD', 'E1M1');
    const index = buildBspRenderIndex(map)!;
    const segIndices = index.subsectorSegs[7] ?? [];
    const triangles = subsectorToTriangles(map, segIndices);

    expect(triangles.length).toBeGreaterThan(0);
    expect(Math.abs(subsectorSignedArea(map, segIndices))).toBeGreaterThan(1000);
  });

  it('includes sector flats in CPU geometry build', () => {
    const map = loadMap('DOOM2.WAD', 'MAP01');
    const geometry = buildMapGeometryCpu(map, {});

    expect(geometry.flats.length).toBeGreaterThan(0);
  });
});

function loadMap(wadName: string, mapName: string) {
  const wadPath = path.resolve(process.cwd(), `public/wads/${wadName}`);
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps[mapName];
}
