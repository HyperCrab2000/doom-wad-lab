import { describe, expect, it } from 'vitest';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import { DoorSystem } from '@/wad/game/doorSystem';
import {
  getCachedBlockingSegments,
  invalidateBlockingSegmentCache,
  isBlockingLineForPlayer,
} from '@/wad/renderer/controls/doomCollision';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import { buildWallRangesByLine } from '@/wad/renderer/geometry/geometryCache';
import { mapToWallsForLine } from '@/wad/renderer/geometry/mapToWalls';
import { getLineIndicesForSectors } from '@/wad/renderer/geometry/sectorLineIndex';
import { uploadCpuGeometry } from '@/wad/renderer/geometry/createBuffers';
import {
  refreshDoorWallGeometry,
  refreshMapGeometry,
} from '@/wad/renderer/geometry/refreshMapGeometry';

function crusherDoorMap(): WadMap {
  const doorSector = {
    floorheight: 0,
    ceilingheight: 0,
    floorpic: 'FLOOR0_1',
    ceilingpic: 'CEIL1_1',
    lightlevel: 255,
    type: 0,
    tag: 0,
  } as Sector;

  const roomSector = {
    floorheight: 0,
    ceilingheight: 88,
    floorpic: 'FLOOR0_1',
    ceilingpic: 'CEIL1_1',
    lightlevel: 255,
    type: 0,
    tag: 0,
  } as Sector;

  return {
    VERTEXES: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
    ],
    LINEDEFS: [
      {
        v1: 0,
        v2: 1,
        special: 1,
        tag: 0,
        sidenum: [0, 1],
        flags: { impassible: false, blockMonsters: false, twoSided: true, upperUnpegged: false, lowerUnpegged: false, secret: false, blockSound: false, notOnMap: false, alreadyOnMap: false },
      },
    ],
    SIDEDEFS: [
      { sector: 0, xOffset: 0, yOffset: 0, topTexture: 'BIGDOOR2', bottomTexture: '-', midTexture: '-' },
      { sector: 1, xOffset: 0, yOffset: 0, topTexture: '-', bottomTexture: '-', midTexture: '-' },
    ],
    SECTORS: [roomSector, doorSector],
  } as unknown as WadMap;
}

describe('door runtime integration', () => {
  it('must invalidate blocking cache when a door sector opens', () => {
    const map = crusherDoorMap();
    const line = map.LINEDEFS[0];
    const feetZ = 0;

    expect(isBlockingLineForPlayer(map, line, feetZ)).toBe(true);

    const blockedBefore = getCachedBlockingSegments(map, feetZ, 0);
    expect(blockedBefore.some((segment) => segment.x1 === 0 && segment.x2 === 64)).toBe(true);

    map.SECTORS[1].ceilingheight = 88;

    const blockedStale = getCachedBlockingSegments(map, feetZ, 0);
    expect(blockedStale.length).toBe(blockedBefore.length);

    invalidateBlockingSegmentCache();
    expect(isBlockingLineForPlayer(map, line, feetZ)).toBe(false);
    expect(getCachedBlockingSegments(map, feetZ, 0)).toHaveLength(0);
  });

  it('changes wall counts for crusher doors when the sector opens', () => {
    const map = crusherDoorMap();
    const texturesByName = {
      BIGDOOR2: { name: 'BIGDOOR2', width: 128, height: 128, transparent: false },
      BLAKWAL1: { name: 'BLAKWAL1', width: 64, height: 128, transparent: false },
    };

    const closedGeometry = buildMapGeometryCpu(map, texturesByName);
    // GZDoom only creates geometry for the sidedef with an explicit texture (side 0, BIGDOOR2).
    // Side 1 has no texture ('-') so no geometry — phantom back-side walls were removed.
    expect(mapToWallsForLine(map, texturesByName, 0).length).toBe(1);
    expect(buildWallRangesByLine(closedGeometry.walls, map.LINEDEFS.length)[0].count).toBe(1);

    map.SECTORS[1].ceilingheight = 88;
    expect(mapToWallsForLine(map, texturesByName, 0).length).toBe(0);
  });

  it('raises the door sector ceiling when triggered', () => {
    const map = crusherDoorMap();
    const system = new DoorSystem(map);

    expect(system.tryUseLine(0, map.LINEDEFS[0]).triggered).toBe(true);

    for (let i = 0; i < 80 && map.SECTORS[1].ceilingheight < 80; i++) {
      system.tick(0.05);
    }

    expect(map.SECTORS[1].ceilingheight).toBeGreaterThan(56);
  });

  it('uploads new wall positions when a door sector ceiling moves', () => {
    const map = crusherDoorMap();
    const texturesByName = {
      BIGDOOR2: { name: 'BIGDOOR2', width: 128, height: 128, transparent: false },
      BLAKWAL1: { name: 'BLAKWAL1', width: 64, height: 128, transparent: false },
    };
    const geometry = buildMapGeometryCpu(map, texturesByName);
    const gl = createMockGl();
    const buffers = uploadCpuGeometry(gl, map, geometry);
    const closedBottomY = buffers.walls[0].center[1];

    const system = new DoorSystem(map);
    system.tryUseLine(0, map.LINEDEFS[0]);
    system.tick(0.05);

    refreshDoorWallGeometry(gl, map, texturesByName, buffers, system.getDirtySectors());

    expect(map.SECTORS[1].ceilingheight).toBeGreaterThan(0);
    expect(buffers.walls[0].center[1]).toBeGreaterThan(closedBottomY);
    const positions = new Float32Array(gl.getBufferData(buffers.walls[0].position.buffer)!);
    expect(positions[1]).toBeGreaterThan(0);
  });

  it('does not treat linedefs without wall meshes as a partial-refresh failure', () => {
    const map = crusherDoorMap();
    map.LINEDEFS.push({
      v1: 0,
      v2: 1,
      special: 0,
      tag: 0,
      sidenum: [0, 1],
      flags: map.LINEDEFS[0].flags,
    });

    const texturesByName = {
      BIGDOOR2: { name: 'BIGDOOR2', width: 128, height: 128, transparent: false },
      BLAKWAL1: { name: 'BLAKWAL1', width: 64, height: 128, transparent: false },
    };

    const geometry = buildMapGeometryCpu(map, texturesByName);
    const buffers = {
      sectorTriangles: geometry.sectorTriangles,
      triangleHash: null,
      sectorVisibility: null,
      flats: [],
      walls: geometry.walls.map((wall, index) => ({
        ...wall,
        sectorIndex: wall.sectorIndex ?? 0,
        lineIndex: wall.lineIndex ?? 0,
        positionBytes: wall.position.byteLength,
        uvBytes: wall.uv.byteLength,
        normalBytes: wall.normal.byteLength,
        indicesBytes: wall.indices.byteLength,
        transparent: Boolean(wall.transparent),
        twoSidedMiddle: Boolean(wall.twoSidedMiddle),
        repeatVertical: wall.repeatVertical !== false,
        facingNormal: [0, 0, 1] as [number, number, number],
        boundsRadius: 160,
      })),
      opaqueWalls: [],
      transparentWalls: [],
      sortedFlats: [],
      wallRangesByLine: buildWallRangesByLine(geometry.walls, map.LINEDEFS.length),
      thing: {} as never,
    };

    const dirty = new Set([0, 1]);
    const lineIndices = getLineIndicesForSectors(map, dirty);
    expect(lineIndices.size).toBeGreaterThan(1);

    let missingRange = false;
    for (const lineIndex of lineIndices) {
      const newWalls = mapToWallsForLine(map, texturesByName, lineIndex);
      const range = buffers.wallRangesByLine[lineIndex];
      if ((!range || range.start < 0) && newWalls.length === 0) continue;
      if (!range || range.start < 0) missingRange = true;
    }

    expect(missingRange).toBe(false);
  });
});

describe('refreshMapGeometry', () => {
  it('returns partial refresh for a small dirty-sector set', () => {
    const map = crusherDoorMap();
    const texturesByName = {
      BIGDOOR2: { name: 'BIGDOOR2', width: 128, height: 128, transparent: false },
      BLAKWAL1: { name: 'BLAKWAL1', width: 64, height: 128, transparent: false },
    };
    const geometry = buildMapGeometryCpu(map, texturesByName);
    const gl = createMockGl();
    const buffers = uploadCpuGeometry(gl, map, geometry);

    const result = refreshMapGeometry(gl, map, texturesByName, buffers, new Set([1]));
    expect(result).toBe('partial');
    expect(buffers.opaqueWalls.length + buffers.transparentWalls.length).toBeGreaterThan(0);
  });

  it('falls back to a full refresh when too many sectors are dirty', () => {
    const map = crusherDoorMap();
    while (map.SECTORS.length < 50) {
      map.SECTORS.push({ ...map.SECTORS[0] });
    }
    const texturesByName = {
      BIGDOOR2: { name: 'BIGDOOR2', width: 128, height: 128, transparent: false },
      BLAKWAL1: { name: 'BLAKWAL1', width: 64, height: 128, transparent: false },
    };
    const geometry = buildMapGeometryCpu(map, texturesByName);
    const gl = createMockGl();
    const buffers = uploadCpuGeometry(gl, map, geometry);

    const dirty = new Set(Array.from({ length: 15 }, (_, index) => index));
    expect(refreshMapGeometry(gl, map, texturesByName, buffers, dirty)).toBe('full');
  });

  it('updates flats and removes wall buffers when a door line becomes empty', () => {
    const map = crusherDoorMap();
    const texturesByName = {
      BIGDOOR2: { name: 'BIGDOOR2', width: 128, height: 128, transparent: false },
      BLAKWAL1: { name: 'BLAKWAL1', width: 64, height: 128, transparent: false },
    };
    const geometry = buildMapGeometryCpu(map, texturesByName);
    const gl = createMockGl();
    const buffers = uploadCpuGeometry(gl, map, geometry);
    const initialWalls = buffers.walls.length;
    expect(buffers.flats.length).toBeGreaterThan(0);

    map.SECTORS[1].ceilingheight = 88;
    refreshMapGeometry(gl, map, texturesByName, buffers, new Set([0, 1]));

    expect(buffers.walls.length).toBeLessThan(initialWalls);
    expect(buffers.sortedFlats.length).toBeGreaterThan(0);
  });

  it('falls back to full refresh when a dirty line has no wall range', () => {
    const map = crusherDoorMap();
    const texturesByName = {
      BIGDOOR2: { name: 'BIGDOOR2', width: 128, height: 128, transparent: false },
      BLAKWAL1: { name: 'BLAKWAL1', width: 64, height: 128, transparent: false },
    };
    const geometry = buildMapGeometryCpu(map, texturesByName);
    const gl = createMockGl();
    const buffers = uploadCpuGeometry(gl, map, geometry);
    buffers.wallRangesByLine[0] = { start: -1, count: 0 };

    expect(refreshMapGeometry(gl, map, texturesByName, buffers, new Set([1]))).toBe('full');
  });

  it('rebuilds all wall buffers when the cached wall count is stale', () => {
    const map = crusherDoorMap();
    const texturesByName = {
      BIGDOOR2: { name: 'BIGDOOR2', width: 128, height: 128, transparent: false },
      BLAKWAL1: { name: 'BLAKWAL1', width: 64, height: 128, transparent: false },
    };
    const geometry = buildMapGeometryCpu(map, texturesByName);
    const gl = createMockGl();
    const buffers = uploadCpuGeometry(gl, map, geometry);
    buffers.walls.pop();

    expect(refreshMapGeometry(gl, map, texturesByName, buffers)).toBe('full');
    expect(buffers.walls.length).toBe(geometry.walls.length);
  });

  it('reuses buffer uploads when geometry size is unchanged', () => {
    const map = crusherDoorMap();
    const texturesByName = {
      BIGDOOR2: { name: 'BIGDOOR2', width: 128, height: 128, transparent: false },
      BLAKWAL1: { name: 'BLAKWAL1', width: 64, height: 128, transparent: false },
    };
    const geometry = buildMapGeometryCpu(map, texturesByName);
    const gl = createMockGl();
    const buffers = uploadCpuGeometry(gl, map, geometry);
    const positionBuffer = buffers.walls[0].position.buffer;
    const before = new Float32Array(gl.getBufferData(positionBuffer)!);

    map.SECTORS[1].ceilingheight = 40;
    refreshDoorWallGeometry(gl, map, texturesByName, buffers, new Set([1]));

    const after = new Float32Array(gl.getBufferData(positionBuffer)!);
    expect(after.some((value, index) => value !== before[index])).toBe(true);
  });
});

function createMockGl(): WebGL2RenderingContext & {
  getBufferData: (buffer: WebGLBuffer) => ArrayBuffer | null;
  getInitialBufferData: (buffer: WebGLBuffer) => ArrayBuffer | null;
} {
  const latest = new Map<WebGLBuffer, ArrayBuffer>();
  const initial = new Map<WebGLBuffer, ArrayBuffer>();
  let nextId = 1;
  let bound: WebGLBuffer | null = null;

  const gl = {
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    DYNAMIC_DRAW: 0x88e8,
    createBuffer: () => ({ id: nextId++ }) as WebGLBuffer,
    bindBuffer: (_target: number, buffer: WebGLBuffer | null) => {
      bound = buffer;
    },
    bufferData: (_target: number, data: ArrayBufferView) => {
      if (!bound) return;
      const copy = data.slice().buffer;
      latest.set(bound, copy);
      if (!initial.has(bound)) initial.set(bound, copy.slice(0));
    },
    bufferSubData: (_target: number, _offset: number, data: ArrayBufferView) => {
      if (!bound) return;
      latest.set(bound, data.slice().buffer);
    },
    deleteBuffer: (buffer: WebGLBuffer) => {
      latest.delete(buffer);
      initial.delete(buffer);
    },
    getBufferData: (buffer: WebGLBuffer) => latest.get(buffer) ?? null,
    getInitialBufferData: (buffer: WebGLBuffer) => initial.get(buffer) ?? null,
  };

  return gl as unknown as WebGL2RenderingContext & {
    getBufferData: (buffer: WebGLBuffer) => ArrayBuffer | null;
    getInitialBufferData: (buffer: WebGLBuffer) => ArrayBuffer | null;
  };
}
