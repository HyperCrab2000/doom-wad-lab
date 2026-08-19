import { describe, expect, it } from 'vitest';

import {
  clearMapLoadCache,
  getCachedMapLoad,
  mapLoadCacheKey,
  setCachedMapLoad,
} from '@/wad/renderer/renderGame/mapLoadCache';

describe('mapLoadCache', () => {
  it('builds stable cache keys from wad path and map name', () => {
    expect(mapLoadCacheKey('/wads/DOOM.WAD', 'E1M1')).toBe('v16::play::color::full::/wads/DOOM.WAD::E1M1');
    expect(mapLoadCacheKey(null, 'MAP01')).toBe('v16::play::color::full::memory::MAP01');
    expect(mapLoadCacheKey(undefined, 'MAP01')).toBe('v16::play::color::full::memory::MAP01');
    expect(mapLoadCacheKey('/wads/DOOM.WAD', 'E1M1', false, true)).toBe(
      'v16::play::index::full::/wads/DOOM.WAD::E1M1',
    );
    expect(mapLoadCacheKey('/wads/DOOM.WAD', 'E1M1', true)).toBe(
      'v16::parity::index::full::/wads/DOOM.WAD::E1M1',
    );
    expect(mapLoadCacheKey('/wads/DOOM.WAD', 'E1M1', false, true, true)).toBe(
      'v16::play::index::gzcore::/wads/DOOM.WAD::E1M1',
    );
  });

  it('stores and retrieves cached map load promises', async () => {
    clearMapLoadCache();
    const key = mapLoadCacheKey('/wads/DOOM.WAD', 'E1M1');
    const promise = Promise.resolve({ marker: 'geometry' } as never);

    setCachedMapLoad(key, promise);
    expect(getCachedMapLoad(key)).toBe(promise);
    await expect(getCachedMapLoad(key)).resolves.toEqual({ marker: 'geometry' });
  });

  it('removes failed promises so retries can succeed', async () => {
    clearMapLoadCache();
    const key = mapLoadCacheKey('/wads/DOOM.WAD', 'E1M2');
    const failing = Promise.reject(new Error('load failed'));
    failing.catch(() => {});

    setCachedMapLoad(key, failing);
    await expect(failing).rejects.toThrow('load failed');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getCachedMapLoad(key)).toBeUndefined();
  });

  it('clears all cached entries', async () => {
    clearMapLoadCache();
    const key = mapLoadCacheKey('/wads/DOOM.WAD', 'E1M3');
    setCachedMapLoad(key, Promise.resolve({ marker: 'geometry' } as never));

    clearMapLoadCache();
    expect(getCachedMapLoad(key)).toBeUndefined();
  });
});
