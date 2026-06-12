import { describe, expect, it } from 'vitest';
import {
  buildLoadingStatusSegments,
  splitStcfnWords,
  stcfnLumpName,
  titlepicScaleForCanvas,
} from './doomLoadingScreen';

describe('doomLoadingScreen', () => {
  it('maps printable ASCII to STCFN lump names', () => {
    expect(stcfnLumpName('L')).toBe('STCFN076');
    expect(stcfnLumpName('.')).toBe('STCFN046');
    expect(stcfnLumpName(' ')).toBeNull();
  });

  it('integer-scales TITLEPIC to viewport width', () => {
    expect(titlepicScaleForCanvas(640)).toBe(2);
    expect(titlepicScaleForCanvas(319)).toBe(1);
  });

  it('splits pickup-style strings on spaces for STCFN rendering', () => {
    expect(splitStcfnWords('Picked up a health bonus.')).toEqual([
      'Picked',
      'up',
      'a',
      'health',
      'bonus.',
    ]);
  });

  it('splits loading status into segments (STCFN has no space glyph)', () => {
    expect(buildLoadingStatusSegments('E1M1', 3)).toEqual(['LOADING', 'E1M1', '...']);
    expect(buildLoadingStatusSegments(undefined, 0)).toEqual(['LOADING']);
  });
});
