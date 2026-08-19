/** Gold-standard / playable IWAD slug for a map name. */
export type GoldIwadSlug = 'DOOM' | 'DOOM2';

export function resolveGoldIwadSlug(mapName: string, wadPath?: string | null): GoldIwadSlug {
  if (wadPath?.toUpperCase().includes('DOOM2')) return 'DOOM2';
  return mapName.startsWith('MAP') ? 'DOOM2' : 'DOOM';
}

export function resolvePlayableWadPath(mapName: string, wadPath?: string | null): string {
  return resolveGoldIwadSlug(mapName, wadPath) === 'DOOM2' ? '/wads/DOOM2.WAD' : '/wads/DOOM.WAD';
}

export function resolveWadPathFromLocation(
  search: string,
  fallback = '/wads/DOOM.WAD',
): string {
  const params = new URLSearchParams(search);
  const wadParam = params.get('wad');
  if (wadParam) return wadParam;
  const map = params.get('map');
  if (map?.startsWith('MAP')) return '/wads/DOOM2.WAD';
  return fallback;
}

export function goldStandardRefRelPath(mapName: string, wadPath?: string | null): string {
  const slug = resolveGoldIwadSlug(mapName, wadPath);
  return `/artifacts/gzrender-v2/gold-standard/${slug}/${mapName}/ref.png`;
}
