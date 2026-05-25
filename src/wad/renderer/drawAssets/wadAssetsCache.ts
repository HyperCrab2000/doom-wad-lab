import type { Wad } from '@/wad/interfaces/Wad';
import type { WadMap } from '@/wad/interfaces/WadMap';
import { drawWadAssetsForMap, type WadAssets } from '@/wad/renderer/drawAssets/drawWadAssets';
import { mapLoadCacheKey } from '@/wad/renderer/renderGame/mapLoadCache';

const assetsCache = new Map<string, WadAssets>();

export function getCachedWadAssets(
  wad: Wad,
  map: WadMap,
  mapName: string,
  wadPath?: string | null
): WadAssets {
  const key = mapLoadCacheKey(wadPath, mapName);
  const cached = assetsCache.get(key);
  if (cached) return cached;

  const assets = drawWadAssetsForMap(wad, map, mapName);
  assetsCache.set(key, assets);
  return assets;
}

export function clearWadAssetsCache(): void {
  assetsCache.clear();
}
