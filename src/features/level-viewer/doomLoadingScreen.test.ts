import { describe, expect, it } from 'vitest';
import { stcfnLumpName, titlepicScaleForCanvas } from './doomLoadingScreen';

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
});
