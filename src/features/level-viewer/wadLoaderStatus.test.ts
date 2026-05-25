import { describe, expect, it } from 'vitest';
import { Wad } from '@/wad/interfaces/Wad';
import {
  createErrorStatus,
  createLaunchingStatus,
  createMapReadyStatus,
  createReadyStatus,
  initialWadLoadStatus,
} from './wadLoaderStatus';
import {
  clearWadCache,
  deleteCachedWad,
  getCachedWad,
  getWadCacheSize,
  setCachedWad,
} from './wadCache';

const wad = {
  indentification: 'IWAD',
  lumpInfo: [{ name: 'MAP01' }, { name: 'THINGS' }],
  maps: { MAP01: {} },
  textures: { STARTAN3: {} },
  sprites: { TROOA1: new ArrayBuffer(0), SARGA1: new ArrayBuffer(0) },
  flats: { FLOOR0_1: new ArrayBuffer(0) },
} as unknown as Wad;

describe('wad loader status', () => {
  it('summarizes decoded WAD content', () => {
    const status = createReadyStatus(wad, false, 123);

    expect(status.state).toBe('ready');
    expect(status.fromCache).toBe(false);
    expect(status.detail).toContain('1 maps');
    expect(status.detail).toContain('2 lumps');
    expect(status.detail).toContain('1 textures');
    expect(status.steps.map((step) => step.complete)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(status.statusLine).toContain('maps');
    expect(status.steps.find((step) => step.label === 'W_Init')?.message).toContain('lumps');
    expect(status.steps.find((step) => step.label === 'P_Init')?.complete).toBe(true);
  });

  it('marks renderer and sound init as parallel during map launch', () => {
    const cached = createReadyStatus(wad, true, 123);
    const launching = createLaunchingStatus(cached, 'MAP01');

    expect(launching.steps.find((step) => step.label === 'R_Init')?.active).toBe(true);
    expect(launching.steps.find((step) => step.label === 'S_Init')?.active).toBe(true);
    expect(launching.statusLine).toContain('R_Init');
    expect(launching.statusLine).toContain('S_Init');
  });

  it('preserves cache state through map launch readiness', () => {
    const cached = createReadyStatus(wad, true, 123);
    const launching = createLaunchingStatus(cached, 'MAP01');
    const ready = createMapReadyStatus(launching, 'MAP01');

    expect(ready.state).toBe('cache-hit');
    expect(ready.title).toBe('MAP01 ready');
    expect(ready.steps.every((step) => step.complete)).toBe(true);
  });

  it('captures load errors without losing the idle step shape', () => {
    const status = createErrorStatus(new Error('missing wad'), '/wads/MISSING.WAD');

    expect(status.state).toBe('error');
    expect(status.error).toBe('missing wad');
    expect(status.steps).toHaveLength(initialWadLoadStatus.steps.length);
  });
});

describe('wad cache', () => {
  it('stores, deletes, and clears WAD entries by path', () => {
    clearWadCache();

    setCachedWad('/wads/DOOM.WAD', wad, 123);
    expect(getCachedWad('/wads/DOOM.WAD')?.loadedAt).toBe(123);
    expect(getWadCacheSize()).toBe(1);

    deleteCachedWad('/wads/DOOM.WAD');
    expect(getCachedWad('/wads/DOOM.WAD')).toBeUndefined();

    setCachedWad('/wads/DOOM2.WAD', wad, 456);
    clearWadCache();
    expect(getWadCacheSize()).toBe(0);
  });
});
