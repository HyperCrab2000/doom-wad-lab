import type { Wad } from '@/wad/interfaces/Wad';
import type { DoorSpecialDef } from '@/wad/game/lineSpecials';
import type { MapActionResult } from '@/wad/game/mapActionTypes';
import type { DoorTriggerResult } from '@/wad/game/doorSystem';
import type { MoverTriggerResult } from '@/wad/game/floorMoverSystem';
import { DoomSfxPlayer } from '@/features/level-viewer/sfx/doomSfxPlayer';

/**
 * Vanilla Doom map-action SFX (sounds.h / p_switch.c, p_doors.c, p_plats.c, p_floor.c, p_telept.c).
 */
export const DOOM_MAP_SOUNDS = {
  switchOn: 'DSSWTCHN',
  switchOff: 'DSSWTCHX',
  doorOpen: 'DSDOROPN',
  doorClose: 'DSDORCLS',
  blazeOpen: 'DSBDOPN',
  blazeClose: 'DSBDCLS',
  platStart: 'DSPSTART',
  platStop: 'DSPSTOP',
  floorMove: 'DSSTNMOV',
  teleport: 'DSTELEPT',
} as const;

/** Logical mover / line-action sounds returned by game systems. */
export type MapActionSoundKind =
  | 'door'
  | 'blaze'
  | 'platStart'
  | 'platStop'
  | 'floorMove'
  | 'teleport';

export function mapActionSoundLump(kind: MapActionSoundKind): string {
  switch (kind) {
    case 'door':
      return DOOM_MAP_SOUNDS.doorOpen;
    case 'blaze':
      return DOOM_MAP_SOUNDS.blazeOpen;
    case 'platStart':
      return DOOM_MAP_SOUNDS.platStart;
    case 'platStop':
      return DOOM_MAP_SOUNDS.platStop;
    case 'floorMove':
      return DOOM_MAP_SOUNDS.floorMove;
    case 'teleport':
      return DOOM_MAP_SOUNDS.teleport;
    default:
      return DOOM_MAP_SOUNDS.floorMove;
  }
}

export function doorMotionLumps(
  sound: DoorSpecialDef['sound'],
  motion: 'open' | 'close'
): string {
  if (sound === 'blaze') {
    return motion === 'open' ? DOOM_MAP_SOUNDS.blazeOpen : DOOM_MAP_SOUNDS.blazeClose;
  }
  return motion === 'open' ? DOOM_MAP_SOUNDS.doorOpen : DOOM_MAP_SOUNDS.doorClose;
}

export function playMapActionSounds(
  wad: Wad,
  sfx: DoomSfxPlayer,
  result: MapActionResult
): void {
  void sfx.resume();

  if (result.playSwitch) {
    const switchLump =
      result.switchVariant === 'off' ? DOOM_MAP_SOUNDS.switchOff : DOOM_MAP_SOUNDS.switchOn;
    sfx.play(wad, switchLump);
  }

  if (result.playTeleport) {
    sfx.play(wad, DOOM_MAP_SOUNDS.teleport);
  }

  if (result.playOpen) {
    sfx.play(wad, doorMotionLumps(result.sound === 'blaze' ? 'blaze' : 'door', 'open'));
  }
  if (result.playClose) {
    sfx.play(wad, doorMotionLumps(result.sound === 'blaze' ? 'blaze' : 'door', 'close'));
  }

  if (result.playStart && result.sound && result.sound !== 'door' && result.sound !== 'blaze') {
    sfx.play(wad, mapActionSoundLump(result.sound));
  }

  if (result.playStop) {
    sfx.play(wad, DOOM_MAP_SOUNDS.platStop);
  }
}

export function playDoorTriggerSounds(
  wad: Wad,
  sfx: DoomSfxPlayer,
  result: DoorTriggerResult
): void {
  playMapActionSounds(wad, sfx, {
    triggered: result.triggered,
    playSwitch: result.playSwitch,
    playOpen: result.playOpen,
    playClose: result.playClose,
    sound: result.sound,
  });
}

export function playDoorMotionSound(
  wad: Wad,
  sfx: DoomSfxPlayer,
  sound: DoorSpecialDef['sound'],
  motion: 'open' | 'close' | null
): void {
  if (!motion) return;
  void sfx.resume();
  sfx.play(wad, doorMotionLumps(sound, motion));
}

export function playMoverTriggerSounds(
  wad: Wad,
  sfx: DoomSfxPlayer,
  result: MoverTriggerResult
): void {
  playMapActionSounds(wad, sfx, {
    triggered: result.triggered,
    playSwitch: result.playSwitch,
    playStart: result.playStart,
    sound: result.sound,
  });
}
