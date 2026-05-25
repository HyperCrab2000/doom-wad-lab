import { describe, expect, it } from 'vitest';

describe('getOpl3Module', () => {
  it('requires a browser DOM to load the static OPL3 bundle', async () => {
    const { getOpl3Module } = await import('./opl3Browser');
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      await expect(getOpl3Module()).rejects.toThrow(/DOM environment/i);
      return;
    }

    const { Player, format } = await getOpl3Module();
    expect(typeof Player).toBe('function');
    expect(typeof format.MUS).toBe('function');
  });
});
