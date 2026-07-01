import { describe, expect, it } from 'vitest';

import {
  MODULAR_STAGE_ORDER,
  modularStageEnabled,
  modularStageIndex,
  parseModularRenderStage,
} from '@/wad/renderer/modular/modularRenderStage';

describe('modularRenderStage', () => {
  it('orders stages like drawScene / GZDoom HW pipeline', () => {
    expect(MODULAR_STAGE_ORDER.indexOf('sky')).toBeLessThan(MODULAR_STAGE_ORDER.indexOf('flats'));
    expect(MODULAR_STAGE_ORDER.indexOf('flats')).toBeLessThan(MODULAR_STAGE_ORDER.indexOf('wallsOpaque'));
    expect(MODULAR_STAGE_ORDER.indexOf('wallsOpaque')).toBeLessThan(MODULAR_STAGE_ORDER.indexOf('voxels'));
  });

  it('parses aliases and numeric indices', () => {
    expect(parseModularRenderStage('wireframe')).toBe('visibilityWireframe');
    expect(parseModularRenderStage('3')).toBe('sky');
    expect(parseModularRenderStage('full')).toBe('sprites');
  });

  it('caps passes cumulatively', () => {
    expect(modularStageEnabled('flats', 'sky')).toBe(true);
    expect(modularStageEnabled('flats', 'flats')).toBe(true);
    expect(modularStageEnabled('flats', 'wallsOpaque')).toBe(false);
    expect(modularStageEnabled(null, 'wallsOpaque')).toBe(true);
  });

  it('unlit bands sit before textured bands', () => {
    expect(modularStageIndex('flatsUnlit')).toBeLessThan(modularStageIndex('flats'));
    expect(modularStageIndex('wallsUnlit')).toBeLessThan(modularStageIndex('wallsOpaque'));
  });
});
