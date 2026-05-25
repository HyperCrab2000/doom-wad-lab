import { Wad } from '@/wad/interfaces/Wad';

export interface CachedWad {
  wad: Wad;
  loadedAt: number;
}

const wadCache = new Map<string, CachedWad>();

export function getCachedWad(path: string): CachedWad | undefined {
  return wadCache.get(path);
}

export function setCachedWad(path: string, wad: Wad, loadedAt = Date.now()): CachedWad {
  const cached = { wad, loadedAt };
  wadCache.set(path, cached);
  return cached;
}

export function deleteCachedWad(path: string): void {
  wadCache.delete(path);
}

export function clearWadCache(): void {
  wadCache.clear();
}

export function getWadCacheSize(): number {
  return wadCache.size;
}
