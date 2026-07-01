import fs from 'node:fs';
import path from 'node:path';

import type { WadMap } from '@/wad/interfaces/WadMap';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex, type BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildBspVisibleSet } from '@/wad/renderer/bsp/bspVisibility';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { traceClassicBsp } from '@/wad/renderer/bsp/classicBspTrace';
import { buildSectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';

export const DOOM1_WAD = 'DOOM.WAD';
export const DOOM2_WAD = 'DOOM2.WAD';

export interface MapRef {
  wadName: string;
  mapName: string;
}

export interface SectorProbe extends MapRef {
  sectorIndex: number;
  viewX: number;
  viewY: number;
}

export interface VanillaBspView {
  mapRef: MapRef;
  map: WadMap;
  index: BspRenderIndex;
  sectorVisibility: ReturnType<typeof buildSectorVisibilityIndex>;
  viewX: number;
  viewY: number;
  viewYaw: number;
}

interface CachedMap {
  map: WadMap;
  index: BspRenderIndex;
  sectorVisibility: ReturnType<typeof buildSectorVisibilityIndex>;
}

const mapCache = new Map<string, CachedMap>();

function cacheKey(wadName: string, mapName: string): string {
  return `${wadName}::${mapName}`;
}

export function loadCachedMap(wadName: string, mapName: string): CachedMap {
  const key = cacheKey(wadName, mapName);
  const hit = mapCache.get(key);
  if (hit) return hit;

  const wadPath = path.resolve(process.cwd(), `public/wads/${wadName}`);
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const map = wad.maps[mapName];
  if (!map) throw new Error(`${mapName} missing from ${wadName}`);
  const index = buildBspRenderIndex(map);
  if (!index) throw new Error(`BSP index missing for ${mapName}`);
  const sectorVisibility = buildSectorVisibilityIndex(map);

  const cached: CachedMap = { map, index, sectorVisibility };
  mapCache.set(key, cached);
  return cached;
}

export function loadWadMap(wadName: string, mapName: string): WadMap {
  return loadCachedMap(wadName, mapName).map;
}

export function listIwadMaps(): MapRef[] {
  const refs: MapRef[] = [];
  for (const wadName of [DOOM1_WAD, DOOM2_WAD]) {
    const wadPath = path.resolve(process.cwd(), `public/wads/${wadName}`);
    if (!fs.existsSync(wadPath)) continue;
    const buf = fs.readFileSync(wadPath);
    const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    for (const mapName of Object.keys(wad.maps).sort()) {
      refs.push({ wadName, mapName });
    }
  }
  return refs;
}

export function playerStartView(map: WadMap): { viewX: number; viewY: number; viewYaw: number } {
  const start = map.THINGS.find((thing) => thing.type === 1);
  return {
    viewX: start?.x ?? 0,
    viewY: start?.y ?? 0,
    viewYaw: ((start?.angle ?? 90) * Math.PI) / 180,
  };
}

export function sectorProbePoint(map: WadMap, sectorIndex: number): { viewX: number; viewY: number } | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const line of map.LINEDEFS) {
    for (const sideIndex of line.sidenum) {
      if (sideIndex < 0) continue;
      if (map.SIDEDEFS[sideIndex]?.sector !== sectorIndex) continue;
      const v1 = map.VERTEXES[line.v1];
      const v2 = map.VERTEXES[line.v2];
      if (v1) {
        sumX += v1.x;
        sumY += v1.y;
        count++;
      }
      if (v2) {
        sumX += v2.x;
        sumY += v2.y;
        count++;
      }
    }
  }
  if (count === 0) return null;
  return { viewX: sumX / count, viewY: sumY / count };
}

export function enumerateSectorProbes(mapRef: MapRef): SectorProbe[] {
  const { map } = loadCachedMap(mapRef.wadName, mapRef.mapName);
  const probes: SectorProbe[] = [];
  for (let sectorIndex = 0; sectorIndex < map.SECTORS.length; sectorIndex++) {
    const sector = map.SECTORS[sectorIndex];
    if (!sector || sector.ceilingheight <= sector.floorheight) continue;
    const point = sectorProbePoint(map, sectorIndex);
    if (!point) continue;
    probes.push({
      ...mapRef,
      sectorIndex,
      viewX: point.viewX,
      viewY: point.viewY,
    });
  }
  return probes;
}

export function buildVanillaBspView(
  mapRef: MapRef,
  viewX: number,
  viewY: number,
  viewYaw: number
): VanillaBspView {
  const { map, index, sectorVisibility } = loadCachedMap(mapRef.wadName, mapRef.mapName);
  return { mapRef, map, index, sectorVisibility, viewX, viewY, viewYaw };
}

export function runVanillaBspVisible(view: VanillaBspView) {
  return buildBspVisibleSet({
    map: view.map,
    index: view.index,
    viewX: view.viewX,
    viewY: view.viewY,
    viewYaw: view.viewYaw,
  });
}

export function runClassicBspTrace(view: VanillaBspView) {
  return traceClassicBsp({
    map: view.map,
    index: view.index,
    viewX: view.viewX,
    viewY: view.viewY,
    viewYaw: view.viewYaw,
  });
}

export function runMeshDrawState(view: VanillaBspView) {
  return buildGzdoomDrawState({
    map: view.map,
    buffers: {
      bspRenderIndex: view.index,
      sectorTriangles: {},
      triangleHash: null,
      sectorVisibility: view.sectorVisibility,
      wallRangesByLine: [],
      flats: [],
      subsectorFlats: [],
    } as never,
    viewX: view.viewX,
    viewY: view.viewY,
    viewYaw: view.viewYaw,
    cameraPos: [view.viewX, 41, -view.viewY],
  });
}

/** Production draw path — subsector flats enabled (GZDoom BSP flat mode). */
export function runProductionMeshDrawState(view: VanillaBspView) {
  const subsectorFlats = mapToSubsectorFlats(view.map, view.index);
  return buildGzdoomDrawState({
    map: view.map,
    buffers: {
      bspRenderIndex: view.index,
      sectorTriangles: {},
      triangleHash: null,
      sectorVisibility: view.sectorVisibility,
      wallRangesByLine: [],
      flats: [],
      subsectorFlats,
    } as never,
    viewX: view.viewX,
    viewY: view.viewY,
    viewYaw: view.viewYaw,
    cameraPos: [view.viewX, 41, -view.viewY],
  });
}

/** Preload all IWAD maps once (call from test setup). */
export function preloadAllIwadMaps(): void {
  for (const mapRef of listIwadMaps()) {
    loadCachedMap(mapRef.wadName, mapRef.mapName);
  }
}

export function allSectorProbes(): SectorProbe[] {
  const probes: SectorProbe[] = [];
  for (const mapRef of listIwadMaps()) {
    probes.push(...enumerateSectorProbes(mapRef));
  }
  return probes;
}
