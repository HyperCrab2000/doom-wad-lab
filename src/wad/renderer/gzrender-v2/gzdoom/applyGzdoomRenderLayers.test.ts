import { describe, expect, it } from 'vitest';

import { DEFAULT_RENDER_LAYER_TOGGLES } from '@/wad/renderer/modular/renderLayerToggles';
import { buildGzdoomLayerArgv } from './applyGzdoomRenderLayers';

describe('buildGzdoomLayerArgv', () => {
  it('maps walls-only toggles to GZDoom CVAR argv pairs', () => {
    const argv = buildGzdoomLayerArgv({
      ...DEFAULT_RENDER_LAYER_TOGGLES,
      solidFloors: false,
      solidCeilings: false,
      floorTextures: false,
      ceilingTextures: false,
    });
    expect(argv).toContain('+gl_render_walls');
    expect(argv).toContain('1');
    expect(argv).toContain('+gl_render_flats');
    expect(argv).toContain('0');
  });

  it('maps wireframe BSP mode to untextured walls only', () => {
    const argv = buildGzdoomLayerArgv({
      ...DEFAULT_RENDER_LAYER_TOGGLES,
      wireframeMode: 'bsp',
    });
    expect(argv).toEqual(
      expect.arrayContaining([
        '+gl_texture',
        '0',
        '+gl_render_walls',
        '1',
        '+gl_render_flats',
        '0',
        '+gl_render_things',
        '0',
      ]),
    );
  });
});
