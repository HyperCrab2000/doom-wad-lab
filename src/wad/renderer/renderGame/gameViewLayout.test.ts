import { describe, expect, it } from 'vitest';

import { computeGameViewLayout, VANILLA_3D_HEIGHT, VANILLA_SCREEN_WIDTH } from './gameViewLayout';

describe('computeGameViewLayout', () => {
  it('letterboxes a 320×168 playfield inside a wide canvas', () => {
    const layout = computeGameViewLayout(1280, 900);
    expect(layout.scale).toBe(4);
    expect(layout.width).toBe(VANILLA_SCREEN_WIDTH * 4);
    expect(layout.height).toBe(VANILLA_3D_HEIGHT * 4);
    expect(layout.offsetX).toBe(Math.round((1280 - layout.width) / 2));
    expect(layout.glY).toBe(900 - layout.offsetY - layout.height);
  });
});
