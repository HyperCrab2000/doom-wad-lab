import { describe, expect, it } from 'vitest';
import { PointLightGrid } from './pointLightGrid';
import type { PointLight } from '@/wad/renderer/renderGame/sectorLighting';

function light(
  x: number,
  y: number,
  z: number,
  radius: number
): PointLight {
  return {
    position: [x, y, z],
    color: [1, 0.5, 0.2],
    intensity: 1,
    radius,
  };
}

describe('PointLightGrid', () => {
  it('returns empty uniforms when no lights', () => {
    const grid = new PointLightGrid();
    grid.rebuild([]);
    expect(grid.queryUniforms([0, 0, 0]).uPointLightCount).toBe(0);
  });

  it('finds the nearest light in a cell', () => {
    const grid = new PointLightGrid(256);
    grid.rebuild([
      light(0, 32, 0, 200),
      light(5000, 32, 0, 200),
    ]);
    const uniforms = grid.queryUniforms([10, 32, 10]);
    expect(uniforms.uPointLightCount).toBeGreaterThan(0);
    expect(uniforms.uPointLightPosition0[0]).toBe(0);
  });

  it('limits to four lights', () => {
    const grid = new PointLightGrid(128);
    grid.rebuild(
      Array.from({ length: 12 }, (_, i) => light(i * 8, 16, i * 8, 400))
    );
    expect(grid.queryUniforms([32, 16, 32]).uPointLightCount).toBe(4);
  });

  it('sums dynamic light from nearby cells', () => {
    const grid = new PointLightGrid(256);
    grid.rebuild([light(0, 16, 0, 300)]);
    const rgb = grid.queryDynamicLight([5, 16, 5]);
    expect(rgb[0]).toBeGreaterThan(0);
    expect(grid.queryDynamicLight([9000, 16, 9000])).toEqual([0, 0, 0]);
  });
});
