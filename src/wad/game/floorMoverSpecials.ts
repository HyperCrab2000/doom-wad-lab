export type MoverActivation = 'switch' | 'walk' | 'gun';
export type MoverRepeat = 'once' | 'repeat';
export type MoverKind =
  | 'plat'
  | 'floorUp'
  | 'floorUpCrush'
  | 'floorDown'
  | 'floorUpNhEF'
  | 'floorDownHEF'
  | 'floorDownHEF8'
  | 'floorUpDelta'
  | 'floorUpShortestLowerTex'
  | 'ceilingDown'
  | 'ceilingUp';

export interface FloorMoverDef {
  activation: MoverActivation;
  repeat: MoverRepeat;
  remote: boolean;
  /** Use back-sector tag instead of line tag (TX / transfer specials). */
  tagFromSector?: boolean;
  kind: MoverKind;
  speed: number;
  waitSeconds: number;
  sound: 'lift' | 'mover' | 'door';
  delta?: number;
}

const SLOW = 35;
const FAST = 280;
const LIFT = 70;
const LIFT_TURBO = 280;

function plat(
  activation: MoverActivation,
  repeat: MoverRepeat,
  speed: number
): FloorMoverDef {
  return { activation, repeat, remote: true, kind: 'plat', speed, waitSeconds: 3, sound: 'lift' };
}

function mover(
  activation: MoverActivation,
  repeat: MoverRepeat,
  kind: MoverKind,
  speed = SLOW,
  extra: Partial<FloorMoverDef> = {}
): FloorMoverDef {
  return {
    activation,
    repeat,
    remote: true,
    kind,
    speed,
    waitSeconds: 0,
    sound: 'mover',
    ...extra,
  };
}

/** Doom lift / floor / ceiling line specials (p_floor.c / p_plats.c). */
export const FLOOR_MOVER_SPECIALS: Record<number, FloorMoverDef> = {
  // Lifts
  10: plat('walk', 'once', LIFT),
  21: plat('switch', 'once', LIFT),
  62: plat('switch', 'repeat', LIFT),
  88: plat('walk', 'repeat', LIFT),
  121: plat('walk', 'once', LIFT_TURBO),
  122: plat('switch', 'once', LIFT_TURBO),
  120: plat('walk', 'repeat', LIFT_TURBO),
  123: plat('switch', 'repeat', LIFT_TURBO),

  // Raise to LIC
  5: mover('walk', 'once', 'floorUp'),
  91: mover('walk', 'repeat', 'floorUp'),
  101: mover('switch', 'once', 'floorUp'),
  64: mover('switch', 'repeat', 'floorUp'),
  24: mover('gun', 'once', 'floorUp'),

  // Raise to LIC - 8 then crush
  56: mover('walk', 'once', 'floorUpCrush', SLOW, { tagFromSector: true }),
  94: mover('walk', 'repeat', 'floorUpCrush', SLOW, { tagFromSector: true }),
  55: mover('switch', 'once', 'floorUpCrush'),
  65: mover('switch', 'repeat', 'floorUpCrush'),

  // Lower to LEF
  38: mover('walk', 'once', 'floorDown'),
  23: mover('switch', 'once', 'floorDown'),
  82: mover('walk', 'repeat', 'floorDown'),
  60: mover('switch', 'repeat', 'floorDown'),
  37: mover('walk', 'once', 'floorDown', SLOW, { tagFromSector: true }),
  84: mover('walk', 'repeat', 'floorDown', SLOW, { tagFromSector: true }),

  // Ceilings
  41: mover('switch', 'once', 'ceilingDown'),
  43: mover('switch', 'repeat', 'ceilingDown'),
  44: mover('walk', 'once', 'ceilingDown'),
  49: mover('switch', 'once', 'ceilingDown'),
  72: mover('walk', 'once', 'ceilingDown'),
  40: mover('walk', 'once', 'ceilingUp'),

  // nhEF
  18: mover('switch', 'once', 'floorUpNhEF'),
  69: mover('switch', 'repeat', 'floorUpNhEF'),
  119: mover('walk', 'once', 'floorUpNhEF'),
  128: mover('walk', 'once', 'floorUpNhEF'),
  130: mover('walk', 'once', 'floorUpNhEF', FAST),
  131: mover('switch', 'once', 'floorUpNhEF', FAST),
  129: mover('walk', 'repeat', 'floorUpNhEF', FAST),
  132: mover('switch', 'repeat', 'floorUpNhEF', FAST),
  22: mover('walk', 'once', 'floorUpNhEF', SLOW, { tagFromSector: true }),
  95: mover('walk', 'repeat', 'floorUpNhEF', SLOW, { tagFromSector: true }),
  20: mover('switch', 'once', 'floorUpNhEF', SLOW, { tagFromSector: true }),
  68: mover('switch', 'repeat', 'floorUpNhEF', SLOW, { tagFromSector: true }),
  47: mover('gun', 'once', 'floorUpNhEF', SLOW, { tagFromSector: true }),

  // HEF
  19: mover('walk', 'once', 'floorDownHEF'),
  102: mover('switch', 'once', 'floorDownHEF'),
  83: mover('walk', 'once', 'floorDownHEF'),
  45: mover('switch', 'repeat', 'floorDownHEF'),
  36: mover('walk', 'once', 'floorDownHEF8', FAST),
  71: mover('switch', 'once', 'floorDownHEF8', FAST),
  98: mover('walk', 'repeat', 'floorDownHEF8', FAST),
  70: mover('switch', 'repeat', 'floorDownHEF8', FAST),

  // Fixed deltas
  58: mover('walk', 'once', 'floorUpDelta', SLOW, { delta: 24 }),
  92: mover('walk', 'repeat', 'floorUpDelta', SLOW, { delta: 24 }),
  15: mover('switch', 'once', 'floorUpDelta', SLOW, { delta: 24, tagFromSector: true }),
  66: mover('switch', 'repeat', 'floorUpDelta', SLOW, { delta: 24, tagFromSector: true }),
  59: mover('walk', 'once', 'floorUpDelta', SLOW, { delta: 24, tagFromSector: true }),
  93: mover('walk', 'repeat', 'floorUpDelta', SLOW, { delta: 24, tagFromSector: true }),
  14: mover('switch', 'once', 'floorUpDelta', SLOW, { delta: 32, tagFromSector: true }),
  67: mover('switch', 'repeat', 'floorUpDelta', SLOW, { delta: 32, tagFromSector: true }),
  140: mover('switch', 'once', 'floorUpDelta', SLOW, { delta: 512 }),

  // Shortest lower texture
  30: mover('walk', 'once', 'floorUpShortestLowerTex'),
  96: mover('walk', 'repeat', 'floorUpShortestLowerTex'),
};

export function getFloorMoverSpecial(special: number): FloorMoverDef | null {
  return FLOOR_MOVER_SPECIALS[special] ?? null;
}
