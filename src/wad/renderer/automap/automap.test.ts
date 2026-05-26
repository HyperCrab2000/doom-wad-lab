import { describe, expect, it } from 'vitest';
import { cycleAutomapCheat } from './automap';

describe('cycleAutomapCheat', () => {
  it('cycles 0 → 1 → 2 → 0', () => {
    expect(cycleAutomapCheat(0)).toBe(1);
    expect(cycleAutomapCheat(1)).toBe(2);
    expect(cycleAutomapCheat(2)).toBe(0);
  });
});
