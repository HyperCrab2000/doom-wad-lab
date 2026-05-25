import { describe, expect, it } from 'vitest';
import { difficulty } from '@/wad/constants/WadInfo';
import { Thing } from '@/wad/interfaces/Thing';
import {
  hasValidFlags,
  isExcludedSpawnThing,
  parseClassicThingFlags,
  parseExtendedThingFlags,
} from './thingFlags';

describe('thing flag parsing', () => {
  it('reads classic Doom skill bits from the thing flags word', () => {
    expect(parseClassicThingFlags(0x1).appearsOnEasy).toBe(true);
    expect(parseClassicThingFlags(0x1).appearsOnHard).toBe(false);
    expect(parseClassicThingFlags(0x4).appearsOnHard).toBe(true);
    expect(parseClassicThingFlags(0x7).appearsOnHard).toBe(true);
    expect(parseClassicThingFlags(0x3).appearsOnHard).toBe(false);
  });

  it('reads classic single-player and deathmatch exclusion bits', () => {
    expect(parseClassicThingFlags(0x14).hideInSingleplayer).toBe(true);
    expect(parseClassicThingFlags(0x14).appearsOnHard).toBe(true);
  });
});

describe('Ultra-Violence spawn filtering', () => {
  it('shows only things flagged for hard skill', () => {
    expect(hasValidFlags(thing(9, { appearsOnHard: true }))).toBe(true);
    expect(
      hasValidFlags(
        thing(9, { appearsOnEasy: true, appearsOnMedium: true, appearsOnHard: false })
      )
    ).toBe(false);
    expect(hasValidFlags(thing(9, { appearsOnEasy: true, appearsOnHard: true }))).toBe(true);
  });

  it('hides deathmatch-only and multiplayer spawn points', () => {
    expect(hasValidFlags(thing(2, { appearsOnHard: true }))).toBe(false);
    expect(hasValidFlags(thing(11, { appearsOnHard: true }))).toBe(false);
    expect(hasValidFlags(thing(9, { appearsOnHard: true, hideInSingleplayer: true }))).toBe(false);
    expect(isExcludedSpawnThing(3)).toBe(true);
  });

  it('matches parser output for a hard-only monster', () => {
    const parsed = parseClassicThingFlags(0x4);
    expect(hasValidFlags(thing(9, parsed))).toBe(true);
  });

  it('matches parser output for easy-only pickups', () => {
    const parsed = parseClassicThingFlags(0x1);
    expect(parsed.difficulty).toBe(difficulty.easy);
    expect(hasValidFlags(thing(8, parsed))).toBe(false);
  });
});

describe('extended thing flag parsing', () => {
  it('keeps the same skill bits as classic Doom', () => {
    const parsed = parseExtendedThingFlags(0x5);
    expect(parsed.appearsOnEasy).toBe(true);
    expect(parsed.appearsOnHard).toBe(true);
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
