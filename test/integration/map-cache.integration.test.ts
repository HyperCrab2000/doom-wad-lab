import { beforeEach, describe, expect, it } from 'vitest';

import { loadWad } from '@/wad/renderer/renderGame/loadWad';
import {
  clearMapLoadCache,
  getCachedMapLoad,
  mapLoadCacheKey,
  setCachedMapLoad,
} from '@/wad/renderer/renderGame/mapLoadCache';
import {
  createMockWebGL2Context,
  hasIntegrationIwad,
  loadWadForMap,
  resetIntegrationCaches,
} from './helpers/wadFixtures';

describe.skipIf(!hasIntegrationIwad())('map load cache integration', () => {
  beforeEach(() => {
    resetIntegrationCaches();
  });

  it('deduplicates buildSharedMapGeometry work for the same wadPath and map', async () => {
    const { path: wadPath, wad, map } = loadWadForMap('MAP01');
    const gl = createMockWebGL2Context();
    const cacheKey = mapLoadCacheKey(wadPath, 'MAP01');

    const firstLoad = loadWad(gl, wad, map, 'MAP01', wadPath);
    const secondLoad = loadWad(gl, wad, map, 'MAP01', wadPath);
    const cachedPromise = getCachedMapLoad(cacheKey);

    expect(cachedPromise).toBeDefined();
    expect(cachedPromise).toBe(getCachedMapLoad(cacheKey));

    const [first, second] = await Promise.all([firstLoad, secondLoad]);
    expect(first.buffers.walls).toBe(second.buffers.walls);
    expect(first.buffers.flats).toBe(second.buffers.flats);
    expect(first.buffers.walls.length).toBeGreaterThan(0);
    expect(first.buffers.flats.length).toBeGreaterThan(0);
  });

  it('uses separate cache entries for different map names', async () => {
    const { path: wadPath, wad } = loadWadForMap('MAP01');
    const gl = createMockWebGL2Context();

    const map01 = wad.maps.MAP01;
    const map02 = wad.maps.MAP02;
    if (!map02) {
      return;
    }

    await loadWad(gl, wad, map01, 'MAP01', wadPath);
    await loadWad(gl, wad, map02, 'MAP02', wadPath);

    const map01Promise = getCachedMapLoad(mapLoadCacheKey(wadPath, 'MAP01'));
    const map02Promise = getCachedMapLoad(mapLoadCacheKey(wadPath, 'MAP02'));

    expect(map01Promise).toBeDefined();
    expect(map02Promise).toBeDefined();
    expect(map01Promise).not.toBe(map02Promise);
  });

  it('drops failed promises from the cache so retries can succeed', async () => {
    const cacheKey = mapLoadCacheKey('/wads/DOOM2.WAD', 'MAP01');
    const failing = Promise.reject(new Error('geometry failed'));
    setCachedMapLoad(cacheKey, failing);

    await expect(getCachedMapLoad(cacheKey)).rejects.toThrow('geometry failed');
    expect(getCachedMapLoad(cacheKey)).toBeUndefined();

    clearMapLoadCache();
  });
});
