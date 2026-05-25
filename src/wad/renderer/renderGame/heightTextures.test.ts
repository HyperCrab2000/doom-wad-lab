import { describe, expect, it } from 'vitest';
import { hasHeightVariation, heightPixelsFromRgba, propagateWallHeightRelief, getWallReliefStrength, getFlatReliefStrength } from './heightTextures';
import type { HeightTextureSet } from './heightTextures';

describe('heightTextures', () => {
  it('detects meaningful height variation', () => {
    expect(hasHeightVariation(new Uint8Array([128, 128, 128, 128]))).toBe(false);
    expect(hasHeightVariation(new Uint8Array([40, 120, 200, 80]))).toBe(true);
  });

  it('builds embossed height from flat color data', () => {
    const rgba = new Uint8ClampedArray(64 * 64 * 4);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4;
        const value = x > 31 ? 220 : 40;
        rgba[i] = value;
        rgba[i + 1] = value;
        rgba[i + 2] = value;
        rgba[i + 3] = 255;
      }
    }

    const height = heightPixelsFromRgba(rgba, 64, 64);
    expect(hasHeightVariation(height)).toBe(true);
    expect(Math.max(...height) - Math.min(...height)).toBeGreaterThan(20);
  });

  it('adds fallback grain when source art is nearly flat', () => {
    const rgba = new Uint8ClampedArray(64 * 64 * 4);
    rgba.fill(128);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;

    const height = heightPixelsFromRgba(rgba, 64, 64);
    expect(hasHeightVariation(height)).toBe(true);
  });

  it('propagates voxel height relief across animated wall texture groups', () => {
    const donor = {} as WebGLTexture;
    const set: HeightTextureSet = {
      walls: { STARTAN2: donor },
      flats: {},
      fallback: {} as WebGLTexture,
      loadedWalls: new Set(['STARTAN2']),
      loadedFlats: new Set(),
      reliefWalls: new Set(['STARTAN2']),
      reliefFlats: new Set(),
    };

    propagateWallHeightRelief(set, {
      STARTAN2: ['STARTAN2', 'STARTAN3'],
      STARTAN3: ['STARTAN2', 'STARTAN3'],
    });

    expect(set.walls.STARTAN3).toBe(donor);
    expect(set.reliefWalls.has('STARTAN3')).toBe(true);
    expect(set.loadedWalls.has('STARTAN3')).toBe(true);
  });

  it('uses stronger relief for voxel height maps than procedural fallbacks', () => {
    const relief = new Set(['STARTAN2', 'PLAINTEX']);
    const loaded = new Set(['STARTAN2']);
    expect(getWallReliefStrength('STARTAN2', relief, loaded)).toBeGreaterThan(
      getWallReliefStrength('PLAINTEX', relief, loaded)
    );
    expect(getFlatReliefStrength('CEIL1_1', new Set(['CEIL1_1']), new Set(['CEIL1_1']))).toBeGreaterThan(0);
  });
});
