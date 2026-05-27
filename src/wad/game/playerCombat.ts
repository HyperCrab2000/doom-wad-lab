import { findGunFireLine } from '@/wad/game/useLines';
import type { MapActionController } from '@/wad/game/mapActionController';
import type { MapActionResult } from '@/wad/game/mapActionTypes';
import type { PlayerInventory } from '@/wad/game/playerInventory';
import { tryFireWeapon } from '@/wad/game/playerWeapons';
import type { WadMap } from '@/wad/interfaces/WadMap';

export interface PlayerFireState {
  lastFireAt: number;
}

export function handlePlayerFire({
  map,
  mapActions,
  inventory,
  fireState,
  x,
  y,
  yaw,
  onLineAction,
}: {
  map: WadMap;
  mapActions: MapActionController;
  inventory: PlayerInventory;
  fireState: PlayerFireState;
  x: number;
  y: number;
  yaw: number;
  onLineAction?: (result: MapActionResult) => void;
}): { sound: string | null; triggeredLine: boolean } {
  const now = performance.now();
  const result = tryFireWeapon(inventory, now, fireState.lastFireAt);
  if (!result.sound) {
    return { sound: null, triggeredLine: false };
  }

  if (result.fired) {
    fireState.lastFireAt = now;
    const gunLine = findGunFireLine(map, { x, y }, { yaw });
    if (gunLine) {
      const lineResult = mapActions.tryUseLine(gunLine.lineIndex, gunLine.line);
      if (lineResult.triggered) {
        onLineAction?.(lineResult);
        return { sound: result.sound, triggeredLine: true };
      }
    }
  }

  return { sound: result.sound, triggeredLine: false };
}
