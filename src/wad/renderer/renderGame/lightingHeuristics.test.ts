import { describe, expect, it } from 'vitest';
import {
  boostEmissiveColor,
  getEmissiveColor,
  getEmissiveHighlightColor,
  getLightTint,
  hasSkyWindow,
} from './lightingHeuristics';

function canvasWithPixels(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number]
): HTMLCanvasElement {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const [r, g, b, a] = pixel(x, y);
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }

  return {
    width,
    height,
    getContext: () => ({
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data,
        width: w,
        height: h,
      }),
    }),
  } as unknown as HTMLCanvasElement;
}

describe('lighting heuristics', () => {
  describe('getEmissiveColor', () => {
    it('averages bright sampled pixels', () => {
      const canvas = canvasWithPixels(16, 16, () => [255, 255, 255, 255]);

      expect(getEmissiveColor(canvas)).toEqual([1, 1, 1]);
    });

    it('returns white when no sampled pixels exceed the brightness threshold', () => {
      const canvas = canvasWithPixels(16, 16, () => [40, 40, 40, 255]);

      expect(getEmissiveColor(canvas)).toEqual([1, 1, 1]);
    });
  });

  describe('getEmissiveHighlightColor', () => {
    it('averages pixels brighter than 200', () => {
      const canvas = canvasWithPixels(4, 4, () => [240, 220, 210, 255]);

      expect(getEmissiveHighlightColor(canvas)).toEqual([
        240 / 255,
        220 / 255,
        210 / 255,
      ]);
    });

    it('returns a dim default when no pixels are bright enough', () => {
      const canvas = canvasWithPixels(4, 4, () => [50, 50, 50, 255]);

      expect(getEmissiveHighlightColor(canvas)).toEqual([0.2, 0.2, 0.2]);
    });
  });

  describe('getLightTint', () => {
    it('averages bright pixels for tint extraction', () => {
      const canvas = canvasWithPixels(2, 2, () => [240, 220, 210, 255]);

      expect(getLightTint(canvas)).toEqual([
        240 / 255,
        220 / 255,
        210 / 255,
      ]);
    });

    it('returns white when no pixels exceed the threshold', () => {
      const canvas = canvasWithPixels(2, 2, () => [100, 100, 100, 255]);

      expect(getLightTint(canvas)).toEqual([1, 1, 1]);
    });
  });

  describe('hasSkyWindow', () => {
    it('detects a shared edge between indoor and sky sectors', () => {
      const sectorLines = {
        0: [{ v1: 0, v2: 1 }],
        1: [{ v1: 1, v2: 0 }],
      };

      expect(hasSkyWindow(0, new Set([1]), sectorLines)).toBe(true);
    });

    it('matches reversed vertex order on shared lines', () => {
      const sectorLines = {
        0: [{ v1: 0, v2: 1 }],
        1: [{ v1: 0, v2: 1 }],
      };

      expect(hasSkyWindow(0, new Set([1]), sectorLines)).toBe(true);
    });

    it('returns false when no sky sector shares a line', () => {
      const sectorLines = {
        0: [{ v1: 0, v2: 1 }],
        1: [{ v1: 2, v2: 3 }],
      };

      expect(hasSkyWindow(0, new Set([1]), sectorLines)).toBe(false);
    });

    it('returns false when the sector has no lines', () => {
      expect(hasSkyWindow(0, new Set([1]), {})).toBe(false);
    });
  });

  describe('boostEmissiveColor', () => {
    it('uses flat ambient tint for liquid floors', () => {
      const base: [number, number, number] = [0.5, 0.5, 0.5];

      expect(boostEmissiveColor('LAVA1', base)[0]).toBeGreaterThan(base[0]);
      expect(boostEmissiveColor('NUKAGE1', base)[1]).toBeGreaterThan(base[1]);
    });

    it('falls back to the base color for non-liquid flats', () => {
      const base: [number, number, number] = [0.4, 0.6, 0.8];

      expect(boostEmissiveColor('FLOOR0_1', base)).toEqual(base);
    });
  });
});
