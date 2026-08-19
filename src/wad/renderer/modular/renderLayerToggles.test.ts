import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RENDER_LAYER_TOGGLES,
  sanitizeRenderLayerToggles,
  type RenderLayerToggles,
} from './renderLayerToggles';

function toggles(overrides: Partial<RenderLayerToggles>): RenderLayerToggles {
  return { ...DEFAULT_RENDER_LAYER_TOGGLES, ...overrides };
}

describe('sanitizeRenderLayerToggles', () => {
  it('restores walls when floors are on but walls were toggled off', () => {
    const next = sanitizeRenderLayerToggles(
      toggles({ solidWalls: false, wallTextures: false, solidFloors: true }),
    );
    expect(next.solidWalls).toBe(true);
    expect(next.wallTextures).toBe(true);
  });

  it('restores sky and ceilings when floors are on but sky shell was toggled off', () => {
    const next = sanitizeRenderLayerToggles(
      toggles({ solidFloors: true, sky: false, solidCeilings: false, ceilingTextures: false }),
    );
    expect(next.sky).toBe(true);
    expect(next.solidCeilings).toBe(true);
    expect(next.ceilingTextures).toBe(true);
  });

  it('restores sky and ceilings when walls are on but sky shell was toggled off', () => {
    const next = sanitizeRenderLayerToggles(
      toggles({ solidWalls: true, sky: false, solidCeilings: false, solidFloors: false }),
    );
    expect(next.sky).toBe(true);
    expect(next.solidCeilings).toBe(true);
    expect(next.ceilingTextures).toBe(true);
  });

  it('leaves wireframe-only debug states untouched', () => {
    const debug = toggles({
      wireframeMode: 'bsp',
      solidWalls: false,
      solidFloors: false,
      sky: false,
    });
    expect(sanitizeRenderLayerToggles(debug)).toEqual(debug);
  });
});
