import { Wad } from '@/wad/interfaces/Wad';
import { DoorSpecialDef, DoorTriggerResult } from '@/wad/game/lineSpecials';
import { DOOM_DOOR_SOUNDS, DoomSfxPlayer } from '@/features/level-viewer/sfx/doomSfxPlayer';

export function playDoorTriggerSounds(
  wad: Wad,
  sfx: DoomSfxPlayer,
  result: DoorTriggerResult
): void {
  void sfx.resume();
  if (result.playSwitch) {
    sfx.play(wad, DOOM_DOOR_SOUNDS.switchOn);
  }
  playDoorMotionSound(wad, sfx, result.sound, result.playOpen ? 'open' : result.playClose ? 'close' : null);
}

export function playDoorMotionSound(
  wad: Wad,
  sfx: DoomSfxPlayer,
  sound: DoorSpecialDef['sound'],
  motion: 'open' | 'close' | null
): void {
  if (!motion) return;
  void sfx.resume();
  const names =
    sound === 'blaze'
      ? { open: DOOM_DOOR_SOUNDS.blazeOpen, close: DOOM_DOOR_SOUNDS.blazeClose }
      : { open: DOOM_DOOR_SOUNDS.doorOpen, close: DOOM_DOOR_SOUNDS.doorClose };
  sfx.play(wad, motion === 'open' ? names.open : names.close);
}
