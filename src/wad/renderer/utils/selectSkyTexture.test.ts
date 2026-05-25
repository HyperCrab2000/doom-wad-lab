import { describe, expect, it } from 'vitest';
import { selectSkyTexture } from './selectSkyTexture';

describe('selectSkyTexture', () => {
  it('uses episode skies for Doom and Ultimate Doom', () => {
    expect(selectSkyTexture('E1M1')).toBe('SKY1');
    expect(selectSkyTexture('E2M1')).toBe('SKY2');
    expect(selectSkyTexture('E3M1')).toBe('SKY3');
    expect(selectSkyTexture('E4M1')).toBe('SKY4');
  });

  it('uses Doom II sky ranges', () => {
    expect(selectSkyTexture('MAP01')).toBe('SKY1');
    expect(selectSkyTexture('MAP12')).toBe('SKY2');
    expect(selectSkyTexture('MAP21')).toBe('SKY3');
  });
});
