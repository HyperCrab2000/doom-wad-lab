import { getCrusherSpecial } from './crusherSpecials';
import { getDonutSpecial } from './donutSpecials';
import { getDoorSpecial } from './lineSpecials';
import { getExitSpecial } from './exitSpecials';
import { getFloorMoverSpecial } from './floorMoverSpecials';
import { getLightSpecial } from './lightSpecials';
import { getStairSpecial } from './stairSpecials';
import { getMovingFloorSpecial } from './movingFloorSpecials';
import { getTeleportSpecial } from './teleportSpecials';

type Activation = 'switch' | 'walk' | 'gun';

function activationOf(special: number): Activation | null {
  const checks: Array<{ activation?: Activation } | null> = [
    getDoorSpecial(special),
    getFloorMoverSpecial(special),
    getTeleportSpecial(special),
    getCrusherSpecial(special),
    getExitSpecial(special),
    getStairSpecial(special),
    getDonutSpecial(special),
    getLightSpecial(special),
  ];
  for (const def of checks) {
    if (def?.activation) return def.activation;
  }
  return null;
}

export function isSwitchActivatableSpecial(special: number): boolean {
  const act = activationOf(special);
  return act === 'switch' || act === 'gun';
}

export function isGunFireActivatableSpecial(special: number): boolean {
  return activationOf(special) === 'gun';
}

export function isWalkActivatableSpecial(special: number): boolean {
  return activationOf(special) === 'walk';
}

/** Walk specials that may be activated with the use key (floors/lifts/stairs, not walk doors). */
export function isUseKeyWalkSpecial(special: number): boolean {
  if (!isWalkActivatableSpecial(special)) return false;
  if (getDoorSpecial(special)?.activation === 'walk') return false;
  if (getTeleportSpecial(special)) return false;
  return (
    getFloorMoverSpecial(special) != null ||
    getMovingFloorSpecial(special) != null ||
    getStairSpecial(special) != null ||
    getCrusherSpecial(special) != null ||
    getLightSpecial(special) != null
  );
}

export function isUseKeyActivatableSpecial(special: number): boolean {
  return isSwitchActivatableSpecial(special) || isUseKeyWalkSpecial(special);
}
