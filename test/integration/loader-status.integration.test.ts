import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearWadCache,
  getCachedWad,
  setCachedWad,
} from '@/features/level-viewer/wadCache';
import {
  createErrorStatus,
  createLaunchingStatus,
  createMapReadyStatus,
  createOpeningStatus,
  createReadingStatus,
  createReadyStatus,
  initialWadLoadStatus,
} from '@/features/level-viewer/wadLoaderStatus';
import { validateWadBuffer } from '@/wad/loader/validateWadBuffer';
import { loadWadForMap, resetIntegrationCaches } from './helpers/wadFixtures';

describe('WAD loader status integration', () => {
  beforeEach(() => {
    resetIntegrationCaches();
  });

  it('mirrors the useDoomLoader opening and reading progression', () => {
    const wadPath = '/wads/DOOM2.WAD';
    const opening = createOpeningStatus(wadPath);
    const reading = createReadingStatus(opening);

    expect(opening.state).toBe('loading');
    expect(opening.steps.find((step) => step.label === 'W_Init')?.active).toBe(true);
    expect(reading.title).toBe('Reading bytes');
    expect(reading.steps.find((step) => step.label === 'Z_Init')?.complete).toBe(true);
  });

  it('summarizes a decoded DOOM2 WAD in ready status', () => {
    const { path: wadPath, wad } = loadWadForMap('MAP01');
    const loadedAt = Date.now();
    const ready = createReadyStatus(wad, false, loadedAt);

    expect(ready.state).toBe('ready');
    expect(ready.detail).toContain('maps');
    expect(ready.detail).toContain('lumps');
    expect(ready.detail).toContain(String(Object.keys(wad.maps).length));
    expect(ready.loadedAt).toBe(loadedAt);
    expect(ready.steps.find((step) => step.label === 'P_Init')?.complete).toBe(true);

    setCachedWad(wadPath, wad, loadedAt);
    const cached = getCachedWad(wadPath);
    expect(cached?.loadedAt).toBe(loadedAt);

    const cachedReady = createReadyStatus(cached!.wad, true, cached!.loadedAt);
    expect(cachedReady.state).toBe('cache-hit');
    expect(cachedReady.fromCache).toBe(true);
  });

  it('progresses through map launch to map-ready status', () => {
    const { wad } = loadWadForMap('MAP01');
    const ready = createReadyStatus(wad, false, Date.now());
    const launching = createLaunchingStatus(ready, 'MAP01');
    const mapReady = createMapReadyStatus(launching, 'MAP01');

    expect(launching.title).toBe('Launching MAP01');
    expect(launching.steps.find((step) => step.label === 'R_Init')?.active).toBe(true);
    expect(launching.steps.find((step) => step.label === 'S_Init')?.active).toBe(true);
    expect(mapReady.title).toBe('MAP01 ready');
    expect(mapReady.steps.every((step) => step.complete)).toBe(true);
  });

  it('captures WAD validation failures in error status', () => {
    const placeholderPath = path.resolve(process.cwd(), 'public/wads/test.wad');
    const bytes = readFileSync(placeholderPath);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    expect(() => validateWadBuffer(buffer, placeholderPath)).toThrow();
    const status = createErrorStatus(new Error('WAD file is too small'), placeholderPath);

    expect(status.state).toBe('error');
    expect(status.error).toContain('too small');
    expect(status.steps).toHaveLength(initialWadLoadStatus.steps.length);
  });

  it('clears cached WAD entries on refresh', () => {
    const { path: wadPath, wad } = loadWadForMap('MAP01');
    setCachedWad(wadPath, wad, 1234);
    expect(getCachedWad(wadPath)?.loadedAt).toBe(1234);

    clearWadCache();
    expect(getCachedWad(wadPath)).toBeUndefined();
  });
});
