export type MoverActivation = 'switch' | 'walk';
export type MoverRepeat = 'once' | 'repeat';
export type MoverKind = 'plat' | 'floorUp' | 'floorDown' | 'ceilingDown' | 'ceilingUp' | 'crush';

export interface FloorMoverDef {
  activation: MoverActivation;
  repeat: MoverRepeat;
  remote: boolean;
  kind: MoverKind;
  /** World units per second. */
  speed: number;
  waitSeconds: number;
  sound: 'lift' | 'mover' | 'door';
}

/** Doom lift / floor / ceiling line specials (subset — p_floor.c / p_plats.c). */
export const FLOOR_MOVER_SPECIALS: Record<number, FloorMoverDef> = {
  // Lifts — down, wait, up
  10: { activation: 'walk', repeat: 'once', remote: true, kind: 'plat', speed: 70, waitSeconds: 3, sound: 'lift' },
  21: { activation: 'switch', repeat: 'once', remote: true, kind: 'plat', speed: 70, waitSeconds: 3, sound: 'lift' },
  62: { activation: 'switch', repeat: 'repeat', remote: true, kind: 'plat', speed: 70, waitSeconds: 3, sound: 'lift' },
  88: { activation: 'walk', repeat: 'repeat', remote: true, kind: 'plat', speed: 70, waitSeconds: 3, sound: 'lift' },
  121: { activation: 'walk', repeat: 'once', remote: true, kind: 'plat', speed: 280, waitSeconds: 3, sound: 'lift' },
  122: { activation: 'switch', repeat: 'once', remote: true, kind: 'plat', speed: 280, waitSeconds: 3, sound: 'lift' },
  120: { activation: 'walk', repeat: 'repeat', remote: true, kind: 'plat', speed: 280, waitSeconds: 3, sound: 'lift' },
  123: { activation: 'switch', repeat: 'repeat', remote: true, kind: 'plat', speed: 280, waitSeconds: 3, sound: 'lift' },

  // Raise floor to lowest adjacent ceiling (LIC)
  5: { activation: 'walk', repeat: 'once', remote: true, kind: 'floorUp', speed: 35, waitSeconds: 0, sound: 'mover' },
  91: { activation: 'walk', repeat: 'repeat', remote: true, kind: 'floorUp', speed: 35, waitSeconds: 0, sound: 'mover' },
  101: { activation: 'switch', repeat: 'once', remote: true, kind: 'floorUp', speed: 35, waitSeconds: 0, sound: 'mover' },
  64: { activation: 'switch', repeat: 'repeat', remote: true, kind: 'floorUp', speed: 35, waitSeconds: 0, sound: 'mover' },

  // Lower floor to lowest adjacent floor (LEF)
  38: { activation: 'walk', repeat: 'once', remote: true, kind: 'floorDown', speed: 35, waitSeconds: 0, sound: 'mover' },
  23: { activation: 'switch', repeat: 'once', remote: true, kind: 'floorDown', speed: 35, waitSeconds: 0, sound: 'mover' },
  82: { activation: 'walk', repeat: 'repeat', remote: true, kind: 'floorDown', speed: 35, waitSeconds: 0, sound: 'mover' },
  60: { activation: 'switch', repeat: 'repeat', remote: true, kind: 'floorDown', speed: 35, waitSeconds: 0, sound: 'mover' },

  // Lower ceiling to floor (+8)
  41: { activation: 'switch', repeat: 'once', remote: true, kind: 'ceilingDown', speed: 35, waitSeconds: 0, sound: 'mover' },
  43: { activation: 'switch', repeat: 'repeat', remote: true, kind: 'ceilingDown', speed: 35, waitSeconds: 0, sound: 'mover' },
  44: { activation: 'walk', repeat: 'once', remote: true, kind: 'ceilingDown', speed: 35, waitSeconds: 0, sound: 'mover' },

  // Raise ceiling (HEC)
  40: { activation: 'walk', repeat: 'once', remote: true, kind: 'ceilingUp', speed: 35, waitSeconds: 0, sound: 'mover' },
};

export function getFloorMoverSpecial(special: number): FloorMoverDef | null {
  return FLOOR_MOVER_SPECIALS[special] ?? null;
}
