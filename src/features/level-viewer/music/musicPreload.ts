import { getSoundfontEngine } from './soundfontEngine';

const preparedKeys = new Set<string>();

export function musicCacheKey(wadPath: string | null, lumpName: string): string {
  return `${wadPath ?? 'wad'}:${lumpName}`;
}

/** Warm MUS→MIDI conversion before the user hits Play. */
export async function preloadMusicLump(
  musData: ArrayBuffer,
  cacheKey: string
): Promise<void> {
  if (preparedKeys.has(cacheKey)) return;

  const engine = await getSoundfontEngine();
  await engine.prepareMus(musData, cacheKey);
  preparedKeys.add(cacheKey);
}

export function clearMusicPreloadCache(): void {
  preparedKeys.clear();
}

export function isMusicPrepared(cacheKey: string): boolean {
  return preparedKeys.has(cacheKey);
}
