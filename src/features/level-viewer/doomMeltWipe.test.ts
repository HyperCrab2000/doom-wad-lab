import { describe, expect, it } from 'vitest';
import {
  createMeltWipeState,
  isMeltWipeComplete,
  meltColumnCount,
  MELT_WIPE_DURATION_MS,
  tickMeltWipeState,
} from './doomMeltWipe';

describe('doomMeltWipe', () => {
  it('uses one column per pixel up to 320 wide (vanilla resolution)', () => {
    expect(meltColumnCount(320)).toBe(320);
    expect(meltColumnCount(800)).toBe(320);
    expect(meltColumnCount(100)).toBe(100);
  });

  it('drips every column downward before completing', () => {
    const state = createMeltWipeState(320, 200);
    const start = performance.now();
    let elapsed = 0;

    while (elapsed < MELT_WIPE_DURATION_MS * 2) {
      tickMeltWipeState(state, 16, 200);
      elapsed += 16;
      if (isMeltWipeComplete(state, elapsed, 200)) break;
    }

    expect(elapsed).toBeGreaterThanOrEqual(MELT_WIPE_DURATION_MS * 0.55);
    expect(state.offset.every((y) => y >= 200)).toBe(true);
  });
});
