import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoundfontEngine } from './soundfontEngine';
import {
  clearMusicPreloadCache,
  isMusicPrepared,
  musicCacheKey,
  preloadMusicLump,
} from './musicPreload';

vi.mock('./soundfontEngine', () => ({
  getSoundfontEngine: vi.fn(),
}));

describe('music preload', () => {
  const prepareMus = vi.fn();

  beforeEach(() => {
    clearMusicPreloadCache();
    prepareMus.mockReset();
    prepareMus.mockResolvedValue(undefined);
    vi.mocked(getSoundfontEngine).mockReset();
    vi.mocked(getSoundfontEngine).mockResolvedValue({
      prepareMus,
    } as Awaited<ReturnType<typeof getSoundfontEngine>>);
  });

  describe('musicCacheKey', () => {
    it('combines wad path and lump name', () => {
      expect(musicCacheKey('/wads/DOOM.WAD', 'D_E1M1')).toBe(
        '/wads/DOOM.WAD:D_E1M1'
      );
    });

    it('uses a default prefix when wad path is null', () => {
      expect(musicCacheKey(null, 'D_RUNNIN')).toBe('wad:D_RUNNIN');
    });
  });

  describe('preloadMusicLump', () => {
    it('prepares MUS data through the soundfont engine', async () => {
      const musData = new ArrayBuffer(8);
      const cacheKey = musicCacheKey('/wads/DOOM.WAD', 'D_E1M1');

      await preloadMusicLump(musData, cacheKey);

      expect(getSoundfontEngine).toHaveBeenCalledTimes(1);
      expect(prepareMus).toHaveBeenCalledWith(musData, cacheKey);
      expect(isMusicPrepared(cacheKey)).toBe(true);
    });

    it('skips preparation when the lump was already preloaded', async () => {
      const musData = new ArrayBuffer(8);
      const cacheKey = musicCacheKey(null, 'D_RUNNIN');

      await preloadMusicLump(musData, cacheKey);
      await preloadMusicLump(musData, cacheKey);

      expect(getSoundfontEngine).toHaveBeenCalledTimes(1);
      expect(prepareMus).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearMusicPreloadCache', () => {
    it('allows the same lump to be prepared again after clearing', async () => {
      const musData = new ArrayBuffer(8);
      const cacheKey = musicCacheKey('/wads/DOOM2.WAD', 'D_RUNNIN');

      await preloadMusicLump(musData, cacheKey);
      clearMusicPreloadCache();

      expect(isMusicPrepared(cacheKey)).toBe(false);

      await preloadMusicLump(musData, cacheKey);

      expect(prepareMus).toHaveBeenCalledTimes(2);
    });
  });
});
