import fs from 'node:fs';
import path from 'node:path';

import type { WadMap } from '@/wad/interfaces/WadMap';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildMapGeometryCpu, type CpuMapGeometry } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import type { FlatObject } from '@/wad/interfaces/FlatObject';

export interface WadMapRef {
  wadName: string;
  mapName: string;
}

export interface SectorSample extends WadMapRef {
  sectorIndex: number;
}

export const DOOM1_WAD = 'DOOM.WAD';
export const DOOM2_WAD = 'DOOM2.WAD';

/** Deterministic sector picks across both IWADs. */
export const MESH_VALIDATION_SAMPLE_COUNT = 100;
export const MESH_VALIDATION_SEED = 0xd00d1a2b;

export function loadWadMap(wadName: string, mapName: string): WadMap {
  const wadPath = path.resolve(process.cwd(), `public/wads/${wadName}`);
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const map = wad.maps[mapName];
  if (!map) {
    throw new Error(`Map ${mapName} not found in ${wadName}`);
  }
  return map;
}

export function listMapsInWad(wadName: string): string[] {
  const wadPath = path.resolve(process.cwd(), `public/wads/${wadName}`);
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return Object.keys(wad.maps).sort();
}

export function buildTextureLookup(map: WadMap): Record<string, WallTexture> {
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }
  for (const sector of map.SECTORS) {
    if (sector.floorpic) texNames.add(sector.floorpic);
    if (sector.ceilingpic) texNames.add(sector.ceilingpic);
  }

  const texturesByName: Record<string, WallTexture> = {};
  for (const name of texNames) {
    texturesByName[name] = {
      name,
      width: 64,
      height: 128,
      transparent: false,
      graphics: {} as never,
    };
  }
  return texturesByName;
}

export function buildMeshGeometry(map: WadMap): {
  geometry: CpuMapGeometry;
  subsectorFlats: FlatObject[];
  bspRenderIndex: NonNullable<ReturnType<typeof buildBspRenderIndex>>;
} {
  const textures = buildTextureLookup(map);
  const geometry = buildMapGeometryCpu(map, textures);
  const bspRenderIndex = buildBspRenderIndex(map)!;
  const subsectorFlats = mapToSubsectorFlats(map, bspRenderIndex);
  return { geometry, subsectorFlats, bspRenderIndex };
}

export function enumerateValidSectors(map: WadMap): number[] {
  const indices: number[] = [];
  for (let sectorIndex = 0; sectorIndex < map.SECTORS.length; sectorIndex++) {
    const sector = map.SECTORS[sectorIndex];
    if (!sector) continue;
    if (sector.ceilingheight <= sector.floorheight) continue;
    indices.push(sectorIndex);
  }
  return indices;
}

export function buildRandomSectorSamples(count: number, seed = MESH_VALIDATION_SEED): SectorSample[] {
  const candidates: SectorSample[] = [];
  for (const wadName of [DOOM1_WAD, DOOM2_WAD]) {
    for (const mapName of listMapsInWad(wadName)) {
      const map = loadWadMap(wadName, mapName);
      for (const sectorIndex of enumerateValidSectors(map)) {
        candidates.push({ wadName, mapName, sectorIndex });
      }
    }
  }

  const rng = mulberry32(seed);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }

  return candidates.slice(0, Math.min(count, candidates.length));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
