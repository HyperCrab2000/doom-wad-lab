import { describe, expect, it } from 'vitest';

import { dampEmissiveForPathTrace } from './pathTraceColors';

describe('pathTraceColors', () => {
  it('damps near-white emissive wall averages', () => {
    const out = dampEmissiveForPathTrace('STARTAN2', [1, 1, 1], 0);
    expect(out[0]).toBeLessThan(0.6);
    expect(out[1]).toBeLessThan(0.6);
    expect(out[2]).toBeLessThan(0.6);
  });

  it('leaves non-emissive flat colors unchanged', () => {
    const out = dampEmissiveForPathTrace('BLOOD1', [0.4, 0.1, 0.1], 1);
    expect(out).toEqual([0.4, 0.1, 0.1]);
  });
});
