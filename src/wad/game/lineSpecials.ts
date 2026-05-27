export type LineActivation = 'switch' | 'walk' | 'gun';
export type LineRepeat = 'once' | 'repeat';
export type DoorAction = 'openWaitClose' | 'open' | 'close' | 'closeWaitOpen';
export type DoorSpeed = 'med' | 'turbo';
export type DoorSound = 'door' | 'blaze';

export interface DoorSpecialDef {
  activation: LineActivation;
  repeat: LineRepeat;
  action: DoorAction;
  speed: DoorSpeed;
  waitSeconds: number;
  sound: DoorSound;
  /** Manual doors move the back sector; remote doors use the line tag. */
  remote: boolean;
}

export const DOOR_SPEED_UNITS_PER_SEC: Record<DoorSpeed, number> = {
  med: 70,
  turbo: 280,
};

export const DOOR_SPECIALS: Record<number, DoorSpecialDef> = {
  1: { activation: 'switch', repeat: 'repeat', action: 'openWaitClose', speed: 'med', waitSeconds: 4, sound: 'door', remote: false },
  26: { activation: 'switch', repeat: 'repeat', action: 'openWaitClose', speed: 'med', waitSeconds: 4, sound: 'door', remote: false },
  27: { activation: 'switch', repeat: 'repeat', action: 'openWaitClose', speed: 'med', waitSeconds: 4, sound: 'door', remote: false },
  28: { activation: 'switch', repeat: 'repeat', action: 'openWaitClose', speed: 'med', waitSeconds: 4, sound: 'door', remote: false },
  31: { activation: 'switch', repeat: 'once', action: 'open', speed: 'med', waitSeconds: 0, sound: 'door', remote: false },
  32: { activation: 'switch', repeat: 'once', action: 'open', speed: 'med', waitSeconds: 0, sound: 'door', remote: false },
  33: { activation: 'switch', repeat: 'once', action: 'open', speed: 'med', waitSeconds: 0, sound: 'door', remote: false },
  34: { activation: 'switch', repeat: 'once', action: 'open', speed: 'med', waitSeconds: 0, sound: 'door', remote: false },
  46: { activation: 'gun', repeat: 'once', action: 'open', speed: 'med', waitSeconds: 0, sound: 'door', remote: false },
  117: { activation: 'switch', repeat: 'repeat', action: 'openWaitClose', speed: 'turbo', waitSeconds: 4, sound: 'blaze', remote: false },
  118: { activation: 'switch', repeat: 'once', action: 'open', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: false },

  2: { activation: 'walk', repeat: 'once', action: 'open', speed: 'med', waitSeconds: 0, sound: 'door', remote: true },
  3: { activation: 'walk', repeat: 'once', action: 'close', speed: 'med', waitSeconds: 0, sound: 'door', remote: true },
  4: { activation: 'walk', repeat: 'once', action: 'openWaitClose', speed: 'med', waitSeconds: 4, sound: 'door', remote: true },
  16: { activation: 'walk', repeat: 'once', action: 'closeWaitOpen', speed: 'med', waitSeconds: 30, sound: 'door', remote: true },
  29: { activation: 'switch', repeat: 'once', action: 'openWaitClose', speed: 'med', waitSeconds: 4, sound: 'door', remote: true },
  42: { activation: 'switch', repeat: 'repeat', action: 'close', speed: 'med', waitSeconds: 0, sound: 'door', remote: true },
  50: { activation: 'switch', repeat: 'once', action: 'close', speed: 'med', waitSeconds: 0, sound: 'door', remote: true },
  61: { activation: 'switch', repeat: 'repeat', action: 'open', speed: 'med', waitSeconds: 0, sound: 'door', remote: true },
  63: { activation: 'switch', repeat: 'repeat', action: 'openWaitClose', speed: 'med', waitSeconds: 4, sound: 'door', remote: true },
  75: { activation: 'walk', repeat: 'once', action: 'close', speed: 'med', waitSeconds: 0, sound: 'door', remote: true },
  76: { activation: 'walk', repeat: 'once', action: 'closeWaitOpen', speed: 'med', waitSeconds: 30, sound: 'door', remote: true },
  86: { activation: 'walk', repeat: 'once', action: 'open', speed: 'med', waitSeconds: 0, sound: 'door', remote: true },
  90: { activation: 'walk', repeat: 'repeat', action: 'openWaitClose', speed: 'med', waitSeconds: 4, sound: 'door', remote: true },
  103: { activation: 'switch', repeat: 'once', action: 'open', speed: 'med', waitSeconds: 0, sound: 'door', remote: true },

  105: { activation: 'switch', repeat: 'once', action: 'openWaitClose', speed: 'turbo', waitSeconds: 4, sound: 'blaze', remote: true },
  106: { activation: 'walk', repeat: 'once', action: 'open', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  107: { activation: 'walk', repeat: 'once', action: 'close', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  108: { activation: 'walk', repeat: 'once', action: 'openWaitClose', speed: 'turbo', waitSeconds: 4, sound: 'blaze', remote: true },
  109: { activation: 'walk', repeat: 'once', action: 'open', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  110: { activation: 'walk', repeat: 'once', action: 'close', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  111: { activation: 'walk', repeat: 'repeat', action: 'openWaitClose', speed: 'turbo', waitSeconds: 4, sound: 'blaze', remote: true },
  112: { activation: 'switch', repeat: 'once', action: 'open', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  113: { activation: 'switch', repeat: 'once', action: 'close', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  114: { activation: 'switch', repeat: 'repeat', action: 'openWaitClose', speed: 'turbo', waitSeconds: 4, sound: 'blaze', remote: true },
  115: { activation: 'switch', repeat: 'repeat', action: 'open', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  116: { activation: 'switch', repeat: 'repeat', action: 'close', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },

  99: { activation: 'switch', repeat: 'repeat', action: 'open', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  133: { activation: 'switch', repeat: 'once', action: 'open', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  134: { activation: 'switch', repeat: 'repeat', action: 'open', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  135: { activation: 'switch', repeat: 'once', action: 'open', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  136: { activation: 'switch', repeat: 'repeat', action: 'open', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
  137: { activation: 'switch', repeat: 'once', action: 'open', speed: 'turbo', waitSeconds: 0, sound: 'blaze', remote: true },
};

export function getDoorSpecial(special: number): DoorSpecialDef | null {
  return DOOR_SPECIALS[special] ?? null;
}
