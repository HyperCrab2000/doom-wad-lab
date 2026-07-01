import { describe, expect, it } from 'vitest';

/** Mirrors PerfMeter bar color thresholds for unit coverage. */
function barColor(ms: number): string {
  if (ms <= 16.7) return '#33ff5a';
  if (ms <= 33.3) return '#ffd23f';
  return '#ff4d4d';
}

describe('PerfMeter thresholds', () => {
  it('maps frame times to green/yellow/red', () => {
    expect(barColor(8)).toBe('#33ff5a');
    expect(barColor(16.7)).toBe('#33ff5a');
    expect(barColor(20)).toBe('#ffd23f');
    expect(barColor(33.3)).toBe('#ffd23f');
    expect(barColor(50)).toBe('#ff4d4d');
  });
});
