import { describe, expect, it } from 'vitest';
import { angle, roundToPow2, subtract } from './math';

describe('math utils', () => {
  describe('roundToPow2', () => {
    it('returns the same value when already a power of two', () => {
      expect(roundToPow2(1)).toBe(1);
      expect(roundToPow2(2)).toBe(2);
      expect(roundToPow2(256)).toBe(256);
    });

    it('rounds up to the next power of two', () => {
      expect(roundToPow2(3)).toBe(4);
      expect(roundToPow2(5)).toBe(8);
      expect(roundToPow2(100)).toBe(128);
      expect(roundToPow2(1000)).toBe(1024);
    });
  });

  describe('angle', () => {
    it('computes atan2 from vertex coordinates', () => {
      expect(angle({ x: 1, y: 0 })).toBeCloseTo(0);
      expect(angle({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
      expect(angle({ x: -1, y: 0 })).toBeCloseTo(Math.PI);
    });
  });

  describe('subtract', () => {
    it('returns the component-wise difference of two vertices', () => {
      expect(subtract({ x: 10, y: 7 }, { x: 3, y: 2 })).toEqual({ x: 7, y: 5 });
      expect(subtract({ x: 0, y: 0 }, { x: 5, y: -3 })).toEqual({ x: -5, y: 3 });
    });
  });
});
