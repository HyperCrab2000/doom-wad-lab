import { describe, expect, it } from 'vitest';

import {
  CLASSIC_LAYER_DEFINITIONS,
  classicLayerTestPreset,
  describeClassicLayerState,
} from '@/wad/renderer/modular/classicLayerMapping';
import { DEFAULT_RENDER_LAYER_TOGGLES } from '@/wad/renderer/modular/renderLayerToggles';

describe('classicLayerMapping', () => {
  it('maps walls-off preset to inactive wall stages', () => {
    const preset = classicLayerTestPreset('walls-off')!;
    const diag = describeClassicLayerState(preset);
    expect(diag.plan.wallsTextured).toBe(false);
    expect(diag.activeStages).not.toContain('wallsOpaque');
    expect(diag.layers.find((l) => l.id === 'walls-solid')?.active).toBe(false);
    expect(diag.layers.find((l) => l.id === 'floors')?.active).toBe(true);
  });

  it('default toggles enable composite geometry layers', () => {
    const diag = describeClassicLayerState(DEFAULT_RENDER_LAYER_TOGGLES);
    expect(diag.plan.wallsTextured).toBe(true);
    expect(diag.activeStages).toContain('wallsOpaque');
    expect(diag.activeStages).toContain('flats');
  });

  it('every definition has node sources and gzdoom cvar hints', () => {
    for (const def of CLASSIC_LAYER_DEFINITIONS) {
      expect(def.nodeSources.length).toBeGreaterThan(0);
      expect(def.id.length).toBeGreaterThan(0);
    }
  });
});
