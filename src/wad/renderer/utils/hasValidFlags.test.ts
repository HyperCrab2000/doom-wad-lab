import { describe, expect, it } from 'vitest';
import { difficulty } from '@/wad/constants/WadInfo';
import { Thing } from '@/wad/interfaces/Thing';
import { hasValidFlags, isExcludedSpawnThing } from './hasValidFlags';

describe('hasValidFlags', () => {
  it('shows only things flagged for Ultra-Violence hard skill', () => {
    expect(hasValidFlags(thing(9, { appearsOnHard: true }))).toBe(true);
    expect(
      hasValidFlags(
        thing(9, { appearsOnEasy: true, appearsOnMedium: true, appearsOnHard: false })
      )
    ).toBe(false);
  });

  it('hides multiplayer spawn points and deathmatch-only things', () => {
    expect(hasValidFlags(thing(2, { appearsOnHard: true }))).toBe(false);
    expect(hasValidFlags(thing(11, { appearsOnHard: true }))).toBe(false);
    expect(hasValidFlags(thing(9, { appearsOnHard: true, hideInSingleplayer: true }))).toBe(false);
    expect(isExcludedSpawnThing(4)).toBe(true);
  });
});

function thing(type: number, flags: Partial<Thing['flags']>): Thing {
  return {
    x: 0,
    y: 0,
    angle: 0,
    type,
    flags: {
      difficulty: difficulty.hard,
      isDeaf: false,
      hideInSingleplayer: false,
      appearsOnEasy: false,
      appearsOnMedium: false,
      appearsOnHard: false,
      ...flags,
    },
  };
}
