import { describe, expect, it } from 'vitest';
import { contains, first, intersects, last } from './array';

describe('array utils', () => {
  describe('first', () => {
    it('returns the first element', () => {
      expect(first([10, 20, 30])).toBe(10);
      expect(first(['a', 'b'])).toBe('a');
    });
  });

  describe('last', () => {
    it('returns the last element', () => {
      expect(last([10, 20, 30])).toBe(30);
      expect(last(['a', 'b'])).toBe('b');
    });
  });

  describe('contains', () => {
    it('returns true when the item is present', () => {
      expect(contains([1, 2, 3], 2)).toBe(true);
    });

    it('returns false when the item is absent', () => {
      expect(contains([1, 2, 3], 4)).toBe(false);
      expect(contains([], 1)).toBe(false);
    });
  });

  describe('intersects', () => {
    it('returns true when arrays share an element', () => {
      expect(intersects([1, 2, 3], [3, 4])).toBe(true);
      expect(intersects(['a', 'b'], ['b', 'c'])).toBe(true);
    });

    it('returns false when arrays are disjoint', () => {
      expect(intersects([1, 2], [3, 4])).toBe(false);
      expect(intersects([], [1])).toBe(false);
      expect(intersects([1], [])).toBe(false);
    });
  });
});
