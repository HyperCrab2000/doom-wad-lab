import { describe, expect, it } from 'vitest';
import {
  getVoxelAnimationEntriesForSprite,
  getVoxelAnimationForSprite,
  parseVoxelDefs,
  parseZScriptAnimations,
} from './voxelCatalog';

describe('voxel catalog parsing', () => {
  it('parses VOXELDEF names into sprite and frame metadata', () => {
    const entries = parseVoxelDefs(`
      SARGA = "SARGA" {}
      SARGB = "SARGB" {}
      /* SKIPZ = "SKIPZ" {} */
    `);

    expect(entries).toEqual([
      { lumpName: 'SARGA', fileName: 'SARGA', sprite: 'SARG', frame: 'A' },
      { lumpName: 'SARGB', fileName: 'SARGB', sprite: 'SARG', frame: 'B' },
    ]);
  });

  it('prefers See state animation frames from ZScript', () => {
    const animations = parseZScriptAnimations(`
      class CheelloDemon : Demon replaces Demon
      {
        States
        {
        Spawn:
          SARG Z 10;
        See:
          SARG AABBCCDD 2 Fast A_CheelloChase();
          Loop;
        }
      }
    `);

    expect(animations.SARG).toEqual({
      sprite: 'SARG',
      state: 'See',
      frames: ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D'],
      source: 'zscript',
    });
  });

  it('uses recovered Voxel Doom source for known monster ordering', () => {
    const animation = getVoxelAnimationForSprite('SARG');
    const entries = getVoxelAnimationEntriesForSprite('SARG');

    expect(animation.source).toBe('zscript');
    expect(animation.frames.slice(0, 8)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D']);
    expect(entries.slice(0, 4).map((entry) => entry.lumpName)).toEqual([
      'SARGA',
      'SARGA',
      'SARGB',
      'SARGB',
    ]);
  });
});
