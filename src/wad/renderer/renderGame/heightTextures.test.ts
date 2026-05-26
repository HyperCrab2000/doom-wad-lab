import { describe, expect, it, vi } from 'vitest';
import {
  clearHeightUrlMissCache,
  createHeightTextureSet,
  generateHeightFromCanvas,
  getFlatReliefStrength,
  getWallReliefStrength,
  hasHeightVariation,
  heightPixelsFromRgba,
  normalizeHeightRange,
  propagateFlatHeightRelief,
  propagateWallHeightRelief,
} from './heightTextures';
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

  it('propagates flat height relief across animated flat groups', () => {
    const donor = {} as WebGLTexture;
    const set: HeightTextureSet = {
      walls: {},
      flats: { FLOOR4_8: donor },
      fallback: {} as WebGLTexture,
      loadedWalls: new Set(),
      loadedFlats: new Set(['FLOOR4_8']),
      reliefWalls: new Set(),
      reliefFlats: new Set(['FLOOR4_8']),
    };

    propagateFlatHeightRelief(set, {
      FLOOR4_8: ['FLOOR4_8', 'FLOOR5_1'],
      FLOOR5_1: ['FLOOR4_8', 'FLOOR5_1'],
    });

    expect(set.flats.FLOOR5_1).toBe(donor);
    expect(set.reliefFlats.has('FLOOR5_1')).toBe(true);
    expect(set.loadedFlats.has('FLOOR5_1')).toBe(true);
  });

  it('uses stronger relief for voxel height maps than procedural fallbacks', () => {
    const relief = new Set(['STARTAN2', 'PLAINTEX']);
    const loaded = new Set(['STARTAN2']);
    expect(getWallReliefStrength('STARTAN2', relief, loaded)).toBeGreaterThan(
      getWallReliefStrength('PLAINTEX', relief, loaded)
    );
    expect(getFlatReliefStrength('CEIL1_1', new Set(['CEIL1_1']), new Set(['CEIL1_1']))).toBeGreaterThan(0);
    expect(getWallReliefStrength('NONE', relief, loaded)).toBe(0);
  });

  it('adds procedural grain when height range is very small', () => {
    const flat = new Uint8Array(16);
    flat.fill(120);
    const normalized = normalizeHeightRange(flat, 4, 4);
    expect(hasHeightVariation(normalized)).toBe(true);
  });

  it('generates height maps from canvas sources when voxel PNGs are missing', async () => {
    clearHeightUrlMissCache();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const rgba = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = (i / 4) % 255;
      rgba[i + 1] = 80;
      rgba[i + 2] = 40;
      rgba[i + 3] = 255;
    }

    const source = {
      width: 64,
      height: 64,
    } as CanvasImageSource;

    const originalCreate = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      const element = originalCreate(tag);
      if (tag === 'canvas') {
        (element as HTMLCanvasElement).width = 32;
        (element as HTMLCanvasElement).height = 32;
        (element as HTMLCanvasElement).getContext = () =>
          ({
            imageSmoothingEnabled: false,
            drawImage: () => {},
            getImageData: () => ({ data: rgba }),
          }) as CanvasRenderingContext2D;
      }
      return element;
    }) as typeof document.createElement;

    const pixels = generateHeightFromCanvas(source, 32, 32);
    expect(hasHeightVariation(pixels)).toBe(true);

    const gl = {
      TEXTURE_2D: 0x0de1,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      LINEAR: 0x2601,
      REPEAT: 0x2901,
      createTexture: () => ({}),
      bindTexture: () => {},
      texImage2D: () => {},
      texParameteri: () => {},
    } as unknown as WebGL2RenderingContext;
    const set = await createHeightTextureSet(gl, ['STARTAN2'], ['FLOOR0_1'], {
      wallCanvases: { STARTAN2: source },
      flatCanvases: { FLOOR0_1: source },
      wallSizes: { STARTAN2: { width: 64, height: 64 } },
    });

    expect(set.walls.STARTAN2).toBeTruthy();
    expect(set.flats.FLOOR0_1).toBeTruthy();
    expect(set.reliefWalls.has('STARTAN2')).toBe(true);
    document.createElement = originalCreate;
    vi.unstubAllGlobals();
  });

  it('caches failed voxel height fetches', async () => {
    clearHeightUrlMissCache();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    const gl = {
      TEXTURE_2D: 0x0de1,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      LINEAR: 0x2601,
      REPEAT: 0x2901,
      createTexture: () => ({}),
      bindTexture: () => {},
      texImage2D: () => {},
      texParameteri: () => {},
    } as unknown as WebGL2RenderingContext;

    await createHeightTextureSet(gl, ['NOHEIGHT'], []);
    await createHeightTextureSet(gl, ['NOHEIGHT'], []);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    clearHeightUrlMissCache();
    vi.unstubAllGlobals();
  });
});
