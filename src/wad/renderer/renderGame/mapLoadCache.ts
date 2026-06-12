import type { FramesByThingNameMap } from './types';
import type { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import type { WadAssets } from '@/wad/renderer/drawAssets/drawWadAssets';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import type { SectorTriangleHash } from '@/wad/renderer/utils/sectorLookup';
import type { SectorVisibilityIndex } from '@/wad/renderer/utils/sectorVisibility';

export interface CachedMapGeometry {
  wadAssets: WadAssets;
  textures: {
    flats: Record<string, WebGLTexture>;
    walls: Record<string, WebGLTexture>;
    things: Record<string, WebGLTexture>;
    sky: Record<string, WebGLTexture>;
    heightWalls: Record<string, WebGLTexture>;
    heightFlats: Record<string, WebGLTexture>;
    heightFallback: WebGLTexture;
    heightWallLoaded: ReadonlySet<string>;
    heightFlatLoaded: ReadonlySet<string>;
    reliefWalls: ReadonlySet<string>;
    reliefFlats: ReadonlySet<string>;
  };
  sortedFramesByThingName: FramesByThingNameMap;
  currentSky: string;
  buffers: MapBuffers;
  wallTexturesByName: Record<string, WallTexture>;
  floorTextureColors: Map<string, [number, number, number]>;
  wallTextureColors: Map<string, [number, number, number]>;
  triangleHash: SectorTriangleHash;
  sectorVisibility: SectorVisibilityIndex;
}

const mapLoadCache = new Map<string, Promise<CachedMapGeometry>>();

/** Increment when baked geometry or GPU buffer layout changes. */
const MAP_GEOMETRY_CACHE_VERSION = 11; // lower/upper wall joint overlap now unconditional

export function mapLoadCacheKey(wadPath: string | null | undefined, mapName: string): string {
  return `v${MAP_GEOMETRY_CACHE_VERSION}::${wadPath ?? 'memory'}::${mapName}`;
}

export function getCachedMapLoad(key: string): Promise<CachedMapGeometry> | undefined {
  return mapLoadCache.get(key);
}

export function setCachedMapLoad(key: string, promise: Promise<CachedMapGeometry>): Promise<CachedMapGeometry> {
  mapLoadCache.set(key, promise);
  promise.catch(() => mapLoadCache.delete(key));
  return promise;
}

export function clearMapLoadCache(): void {
  mapLoadCache.clear();
}
