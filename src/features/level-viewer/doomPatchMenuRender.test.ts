import { describe, expect, it } from 'vitest';
import { layoutForScreen, menuItemCount } from './doomPatchMenuRender';

describe('doomPatchMenuRender', () => {
  it('pause screen is M_PAUSE overlay only (no fake item list)', () => {
    const layout = layoutForScreen('pause', { sfxMuted: false, musicEnabled: true });
    expect(layout.titlePatch).toBe('M_PAUSE');
    expect(layout.items).toEqual([]);
    expect(menuItemCount('pause')).toBe(0);
  });

  it('main menu uses IWAD patch lumps', () => {
    const layout = layoutForScreen('main', { sfxMuted: false, musicEnabled: true });
    expect(layout.titlePatch).toBe('M_DOOM');
    expect(layout.items.map((item) => item.patch)).toEqual([
      'M_NGAME',
      'M_OPTION',
      'M_LOADG',
      'M_SAVEG',
      'M_QUITG',
    ]);
  });
});
