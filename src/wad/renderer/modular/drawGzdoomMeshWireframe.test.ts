import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { doomAngleToYaw } from '@/wad/renderer/controls/playerView';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '@/wad/renderer/geometry/geometryCache';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import {
  countGzdoomMeshWireframeSegments,
  countMeshBoundaryEdges,
} from '@/wad/renderer/modular/drawGzdoomMeshWireframe';

function loadE1M1() {
  const wadPath = path.resolve(process.cwd(), 'public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return wad.maps.E1M1;
}

function buildTextureLookup(map: ReturnType<typeof loadE1M1>) {
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }
  const texturesByName: Record<
    string,
    { name: string; width: number; height: number; transparent: boolean; graphics: never }
  > = {};
  for (const name of texNames) {
    texturesByName[name] = { name, width: 64, height: 128, transparent: false, graphics: {} as never };
  }
  return texturesByName;
}

describe('countGzdoomMeshWireframeSegments', () => {
  it('finds wall and flat edges at E1M1 spawn using CPU geometry copies', () => {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const playerStart = map.THINGS.find((thing) => thing.type === 1)!;
    const viewYaw = doomAngleToYaw(playerStart.angle);
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
    const subsectorFlatObjects = mapToSubsectorFlats(map, index);

    const buffers = {
      bspRenderIndex: index,
      walls: pathTraceWallSlicesFromWallObjects(geometry.walls),
      subsectorFlats: pathTraceFlatSlicesFromFlatObjects(subsectorFlatObjects),
      wallRangesByLine: buildWallRangesByLine(geometry.walls, map.LINEDEFS.length),
      wallRangesByLineAndSide: buildWallRangesByLineAndSide(
        geometry.walls.map((wall) => ({
          lineIndex: wall.lineIndex ?? -1,
          sideDefIndex: wall.sideDefIndex ?? -1,
        })),
        map.LINEDEFS.length,
        map
      ),
    } as never;

    const drawState = buildGzdoomDrawState({
      map,
      buffers: {
        ...buffers,
        sectorVisibility: buildSectorVisibilityIndex(map),
        sectorTriangles: geometry.sectorTriangles,
      },
      viewX: playerStart.x,
      viewY: playerStart.y,
      viewYaw,
      cameraPos: [playerStart.x, 41, -playerStart.y],
    })!;

    const counts = countGzdoomMeshWireframeSegments(map, buffers, drawState);
    const portalCounts = countGzdoomMeshWireframeSegments(
      map,
      buffers,
      drawState,
      'boundary',
      'portal'
    );

    expect(counts.wallSegments).toBeGreaterThan(0);
    expect(counts.flatSegments).toBeGreaterThan(0);
    expect(portalCounts.flatSegments).toBeLessThanOrEqual(counts.flatSegments);
  });
});

describe('mesh boundary edges', () => {
  it('keeps quad perimeter and drops the internal diagonal', () => {
    const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
    expect(countMeshBoundaryEdges(indices)).toBe(4);
  });
});

describe('E1M1 courtyard wireframe visibility', () => {
  function buildE1M1DrawBuffers() {
    const map = loadE1M1();
    const index = buildBspRenderIndex(map)!;
    const geometry = buildMapGeometryCpu(map, buildTextureLookup(map));
    const subsectorFlatObjects = mapToSubsectorFlats(map, index);
    const buffers = {
      bspRenderIndex: index,
      walls: pathTraceWallSlicesFromWallObjects(geometry.walls),
      subsectorFlats: pathTraceFlatSlicesFromFlatObjects(subsectorFlatObjects),
      wallRangesByLine: buildWallRangesByLine(geometry.walls, map.LINEDEFS.length),
      wallRangesByLineAndSide: buildWallRangesByLineAndSide(
        geometry.walls.map((wall) => ({
          lineIndex: wall.lineIndex ?? -1,
          sideDefIndex: wall.sideDefIndex ?? -1,
        })),
        map.LINEDEFS.length,
        map
      ),
    } as never;
    return { map, index, buffers };
  }

  it('window room 43 facing south draws sector 41 walls across the courtyard', () => {
    const { map, index, buffers } = buildE1M1DrawBuffers();
    const drawState = buildGzdoomDrawState({
      map,
      buffers: {
        ...buffers,
        sectorVisibility: buildSectorVisibilityIndex(map),
        sectorTriangles: {},
      },
      viewX: -192,
      viewY: -3128,
      viewYaw: Math.PI,
      cameraPos: [-192, 41, 3128],
    })!;

    const counts = countGzdoomMeshWireframeSegments(map, buffers, drawState, 'boundary', 'bsp');
    expect(counts.wallSegments).toBeGreaterThan(0);
    expect(counts.flatSegments).toBeGreaterThan(0);
    expect(
      drawState.bspWallDrawOrder.some((entry) => map.SIDEDEFS[entry.sideDefIndex]?.sector === 41)
    ).toBe(true);
    expect(
      drawState.bspWallDrawOrder.some((entry) => map.SIDEDEFS[entry.sideDefIndex]?.sector === 42)
    ).toBe(true);

    const flatSectors = new Set(
      drawState.bspFlatSubsectorOrder.map((ss) => index.subsectorToSector[ss] ?? -1)
    );
    expect(flatSectors.has(42)).toBe(true);
    expect(flatSectors.has(43)).toBe(true);
    expect(flatSectors.has(70)).toBe(false);
  });

  it('courtyard facing south draws window-room flats (sectors 42–45)', () => {
    const { map, index, buffers } = buildE1M1DrawBuffers();
    const drawState = buildGzdoomDrawState({
      map,
      buffers: {
        ...buffers,
        sectorVisibility: buildSectorVisibilityIndex(map),
        sectorTriangles: {},
      },
      viewX: -208,
      viewY: -3232,
      viewYaw: Math.PI,
      cameraPos: [-208, 41, 3232],
    })!;

    const flatSectors = new Set(
      drawState.bspFlatSubsectorOrder.map((ss) => index.subsectorToSector[ss] ?? -1)
    );
    expect(flatSectors.has(42)).toBe(true);
    expect(flatSectors.has(43)).toBe(true);
    expect(flatSectors.has(44)).toBe(true);
    expect(countGzdoomMeshWireframeSegments(map, buffers, drawState, 'boundary', 'bsp').wallSegments).toBeGreaterThan(
      0
    );
  });
});
