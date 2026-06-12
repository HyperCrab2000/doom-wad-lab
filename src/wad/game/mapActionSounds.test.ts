import { describe, expect, it } from 'vitest';
import {
  DOOM_MAP_SOUNDS,
  doorMotionLumps,
  mapActionSoundLump,
} from '@/wad/game/mapActionSounds';
import { getFloorMoverSpecial } from '@/wad/game/floorMoverSpecials';

describe('mapActionSounds', () => {
  it('maps vanilla mover sounds to IWAD lumps', () => {
    expect(mapActionSoundLump('platStart')).toBe('DSPSTART');
    expect(mapActionSoundLump('platStop')).toBe('DSPSTOP');
    expect(mapActionSoundLump('floorMove')).toBe('DSSTNMOV');
    expect(mapActionSoundLump('teleport')).toBe('DSTELEPT');
  });

  it('maps door motion to DSDOR* and DSBD* lumps', () => {
    expect(doorMotionLumps('door', 'open')).toBe(DOOM_MAP_SOUNDS.doorOpen);
    expect(doorMotionLumps('door', 'close')).toBe(DOOM_MAP_SOUNDS.doorClose);
    expect(doorMotionLumps('blaze', 'open')).toBe(DOOM_MAP_SOUNDS.blazeOpen);
    expect(doorMotionLumps('blaze', 'close')).toBe(DOOM_MAP_SOUNDS.blazeClose);
  });

  it('assigns plat specials platStart not door open', () => {
    expect(getFloorMoverSpecial(10)?.sound).toBe('platStart');
    expect(getFloorMoverSpecial(21)?.sound).toBe('platStart');
    expect(getFloorMoverSpecial(5)?.sound).toBe('floorMove');
  });
});
