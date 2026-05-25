import type { LoadedWadData } from './loadWad';

const mapLoadCache = new Map<string, Promise<LoadedWadData>>();

export function mapLoadCacheKey(wadPath: string | null | undefined, mapName: string): string {
  return `${wadPath ?? 'memory'}::${mapName}`;
}

export function getCachedMapLoad(key: string): Promise<LoadedWadData> | undefined {
  return mapLoadCache.get(key);
}

export function setCachedMapLoad(key: string, promise: Promise<LoadedWadData>): Promise<LoadedWadData> {
  mapLoadCache.set(key, promise);
  promise.catch(() => mapLoadCache.delete(key));
  return promise;
}

export function clearMapLoadCache(): void {
  mapLoadCache.clear();
}
