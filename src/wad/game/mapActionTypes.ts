import type { MapActionSoundKind } from '@/wad/game/mapActionSounds';
import type { TeleportDestination } from './teleportSystem';

export interface MapActionResult {
  triggered: boolean;
  playSwitch?: boolean;
  /** Exit switch (special 11) uses DSSWTCHX; default is DSSWTCHN. */
  switchVariant?: 'on' | 'off';
  playOpen?: boolean;
  playClose?: boolean;
  playStart?: boolean;
  playStop?: boolean;
  playTeleport?: boolean;
  sound?: MapActionSoundKind;
  teleport?: TeleportDestination;
  /** Vanilla exit line (11, 51, 52, 124). */
  requestExit?: boolean;
}

export const EMPTY_MAP_ACTION: MapActionResult = {
  triggered: false,
  playSwitch: false,
  playOpen: false,
  playClose: false,
  playStart: false,
  playTeleport: false,
  sound: 'door',
};
