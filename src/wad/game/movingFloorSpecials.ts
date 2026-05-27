export type MovingFloorActivation = 'walk';
export type MovingFloorRepeat = 'once' | 'repeat';
export type MovingFloorAction = 'start' | 'stop';

export interface MovingFloorDef {
  activation: MovingFloorActivation;
  repeat: MovingFloorRepeat;
  remote: boolean;
  speed: number;
  waitSeconds: number;
  action: MovingFloorAction;
}

/** Perpetual floor plat (p_floor.c EV_DoFloor type 6 / stop type 7). */
export const MOVING_FLOOR_SPECIALS: Record<number, MovingFloorDef> = {
  53: { activation: 'walk', repeat: 'once', remote: true, speed: 35, waitSeconds: 3, action: 'start' },
  87: { activation: 'walk', repeat: 'once', remote: true, speed: 35, waitSeconds: 3, action: 'start' },
  54: { activation: 'walk', repeat: 'repeat', remote: true, speed: 35, waitSeconds: 3, action: 'stop' },
  89: { activation: 'walk', repeat: 'repeat', remote: true, speed: 35, waitSeconds: 3, action: 'stop' },
};

export function getMovingFloorSpecial(special: number): MovingFloorDef | null {
  return MOVING_FLOOR_SPECIALS[special] ?? null;
}
