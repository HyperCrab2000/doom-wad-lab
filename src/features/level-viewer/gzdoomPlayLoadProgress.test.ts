import { describe, expect, it } from 'vitest';

import {
  gzdoomProgressKicker,
  gzdoomProgressToSteps,
  type GzdoomLoadProgress,
} from '@/features/level-viewer/gzdoomPlayLoadProgress';

describe('gzdoomProgressToSteps', () => {
  const modularParse: GzdoomLoadProgress = {
    phase: 'parse-wad',
    label: 'Parsing WAD lumps',
    detail: '3156 lumps',
    percent: 28,
  };

  const wasmScript: GzdoomLoadProgress = {
    phase: 'load-script',
    label: 'Loading GZDoom WASM script',
    percent: 22,
  };

  it('uses lump-parse steps for modular (s)', () => {
    const steps = gzdoomProgressToSteps(modularParse, 'modular-s');
    expect(steps.map((s) => s.label)).toEqual([
      'Fetch IWAD',
      'Parse lumps',
      'GZSTATE',
      'WASM script',
      'Mount data',
      'P_SetupLevel',
      'Ready',
    ]);
    expect(steps[1]?.active).toBe(true);
    expect(gzdoomProgressKicker('modular-s')).toBe('W_Init · Node');
  });

  it('uses WASM-only steps for gold/play', () => {
    const steps = gzdoomProgressToSteps(wasmScript, 'wasm-gold');
    expect(steps.map((s) => s.label)).toEqual([
      'WASM script',
      'Instantiate',
      'GZDoom assets',
      'Mount IWAD',
      'R_Init',
      'Ready',
    ]);
    expect(steps[0]?.active).toBe(true);
    expect(gzdoomProgressKicker('wasm-gold')).toBe('Gold · WASM');
  });
});
