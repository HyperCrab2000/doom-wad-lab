import type { TeleportDestination } from './teleportSystem';

export interface MapActionResult {
  triggered: boolean;
  playSwitch?: boolean;
  playOpen?: boolean;
  playClose?: boolean;
  playStart?: boolean;
  playTeleport?: boolean;
  sound?: 'door' | 'blaze' | 'lift' | 'mover';
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
