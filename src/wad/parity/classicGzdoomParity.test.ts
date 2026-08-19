import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CLASSIC_EXTRAS_QUERY,
  CLASSIC_GZDOOM_PARITY_LAYER_TOGGLES,
  mergeClassicParityLayerToggles,
  readClassicExtrasFromSearch,
  readClassicGzdoomParityMode,
} from './classicGzdoomParity';

describe('classicGzdoomParity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects classicExtras query param', () => {
    expect(readClassicExtrasFromSearch(`?${CLASSIC_EXTRAS_QUERY}=1`)).toBe(true);
    expect(readClassicExtrasFromSearch('')).toBe(false);
  });

  it('defaults parity on unless classicExtras is set', () => {
    expect(readClassicGzdoomParityMode({ search: '' })).toBe(true);
    expect(readClassicGzdoomParityMode({ search: `?${CLASSIC_EXTRAS_QUERY}=1` })).toBe(false);
  });

  it('honors injected window parity flag when present', () => {
    const win = { __DOOM_CLASSIC_GZDOOM_PARITY__: false } as Window & {
      __DOOM_CLASSIC_GZDOOM_PARITY__?: boolean;
    };
    vi.stubGlobal('window', win);
    expect(readClassicGzdoomParityMode()).toBe(false);

    win.__DOOM_CLASSIC_GZDOOM_PARITY__ = true;
    expect(readClassicGzdoomParityMode()).toBe(true);
  });

  it('merges stored wireframe toggles when parity is on', () => {
    const stored = { ...CLASSIC_GZDOOM_PARITY_LAYER_TOGGLES, wireframeMode: 'walls' as const, meshTriangles: true };
    expect(mergeClassicParityLayerToggles(stored, false)).toBe(stored);
    expect(mergeClassicParityLayerToggles(stored, true)).toMatchObject({
      ...CLASSIC_GZDOOM_PARITY_LAYER_TOGGLES,
      wireframeMode: 'walls',
      meshTriangles: true,
    });
  });
});
