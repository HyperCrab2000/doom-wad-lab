import { describe, expect, it } from 'vitest';
import { Thing } from '@/wad/interfaces/Thing';
import { PointLight } from '@/wad/renderer/renderGame/sectorLighting';
import {
  computeDynamicLightAt,
  computeNearestLightUniforms,
  EMPTY_LIGHT_UNIFORMS,
  selectNearbyPointLights,
} from './precomputedLights';

function light(
  x: number,
  y: number,
  z: number,
  radius: number,
  color: [number, number, number] = [1, 0, 0],
  intensity = 1,
  sourceThing?: Thing
): PointLight {
  return {
    position: [x, y, z],
    color,
    radius,
    intensity,
    sourceThing,
  };
}

describe('precomputed lights', () => {
  describe('selectNearbyPointLights', () => {
    it('returns lights within radius sorted by distance', () => {
      const lights = [
        light(10, 0, 0, 50, [0, 1, 0]),
        light(40, 0, 0, 50),
      ];

      const nearby = selectNearbyPointLights(lights, [0, 0, 0]);

      expect(nearby).toHaveLength(2);
      expect(nearby[0].position[0]).toBe(10);
      expect(nearby[1].position[0]).toBe(40);
    });

    it('excludes lights outside their radius', () => {
      const lights = [light(100, 0, 0, 20)];

      expect(selectNearbyPointLights(lights, [0, 0, 0])).toHaveLength(0);
    });

    it('respects maxLights', () => {
      const lights = [
        light(5, 0, 0, 50),
        light(10, 0, 0, 50),
        light(15, 0, 0, 50),
      ];

      expect(selectNearbyPointLights(lights, [0, 0, 0], 2)).toHaveLength(2);
    });

    it('can exclude lights tied to a specific thing', () => {
      const torch = { type: 35 } as Thing;
      const lights = [
        light(0, 0, 0, 50, [1, 0, 0], 1, torch),
        light(20, 0, 0, 50, [0, 0, 1]),
      ];

      const nearby = selectNearbyPointLights(lights, [0, 0, 0], 4, {
        excludeThing: torch,
      });

      expect(nearby).toHaveLength(1);
      expect(nearby[0].position[0]).toBe(20);
    });
  });

  describe('computeDynamicLightAt', () => {
    it('returns full intensity at the light origin', () => {
      const lights = [light(0, 0, 0, 100, [1, 0.5, 0.25], 2)];

      const result = computeDynamicLightAt(lights, [0, 0, 0]);

      expect(result[0]).toBeCloseTo(2);
      expect(result[1]).toBeCloseTo(1);
      expect(result[2]).toBeCloseTo(0.5);
    });

    it('falls off toward zero at and beyond the radius', () => {
      const lights = [light(0, 0, 0, 100, [0, 0, 1], 1)];

      const mid = computeDynamicLightAt(lights, [50, 0, 0]);
      const edge = computeDynamicLightAt(lights, [100, 0, 0]);
      const outside = computeDynamicLightAt(lights, [200, 0, 0]);

      expect(mid[2]).toBeGreaterThan(edge[2]);
      expect(edge[2]).toBeCloseTo(0);
      expect(outside).toEqual([0, 0, 0]);
    });

    it('sums contributions from multiple nearby lights', () => {
      const lights = [
        light(0, 0, 0, 100, [1, 0, 0], 1),
        light(10, 0, 0, 100, [0, 1, 0], 1),
      ];

      const result = computeDynamicLightAt(lights, [0, 0, 0]);

      expect(result[0]).toBeGreaterThan(0);
      expect(result[1]).toBeGreaterThan(0);
    });
  });

  describe('computeNearestLightUniforms', () => {
    it('returns empty uniforms when no lights are in range', () => {
      const uniforms = computeNearestLightUniforms(
        [light(500, 0, 0, 10)],
        [0, 0, 0]
      );

      expect(uniforms).toEqual(EMPTY_LIGHT_UNIFORMS);
    });

    it('packs up to four nearest lights into shader uniforms', () => {
      const lights = [
        light(5, 10, -5, 50, [1, 0, 0], 0.8),
        light(20, 10, -5, 50, [0, 1, 0], 0.6),
      ];

      const uniforms = computeNearestLightUniforms(lights, [0, 10, 0]);

      expect(uniforms.uPointLightCount).toBe(2);
      expect(uniforms.uPointLightPosition0).toEqual([5, 10, -5]);
      expect(uniforms.uPointLightColor0).toEqual([1, 0, 0]);
      expect(uniforms.uPointLightRadius0).toBe(50);
      expect(uniforms.uPointLightIntensity0).toBe(0.8);
      expect(uniforms.uPointLightPosition1).toEqual([20, 10, -5]);
      expect(uniforms.uPointLightColor1).toEqual([0, 1, 0]);
      expect(uniforms.uPointLightIntensity1).toBe(0.6);
    });

    it('fills all four uniform slots when many lights are nearby', () => {
      const lights = [
        light(1, 0, 0, 100),
        light(2, 0, 0, 100),
        light(3, 0, 0, 100),
        light(4, 0, 0, 100),
        light(50, 0, 0, 100),
      ];

      const uniforms = computeNearestLightUniforms(lights, [0, 0, 0]);

      expect(uniforms.uPointLightCount).toBe(4);
      expect(uniforms.uPointLightPosition3).toEqual([4, 0, 0]);
      expect(uniforms.uPointLightPosition0[0]).toBe(1);
    });
  });
});
