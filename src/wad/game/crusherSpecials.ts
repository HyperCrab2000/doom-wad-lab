export type CrusherActivation = 'switch' | 'walk';
export type CrusherRepeat = 'once' | 'repeat';

export type CrusherAction = 'start' | 'stop';

export interface CrusherDef {
  activation: CrusherActivation;
  repeat: CrusherRepeat;
  remote: boolean;
  speed: number;
  action: CrusherAction;
}

/** Doom crusher line specials (p_crush.c). */
export const CRUSHER_SPECIALS: Record<number, CrusherDef> = {
  6: { activation: 'switch', repeat: 'repeat', remote: true, speed: 35, action: 'start' },
  25: { activation: 'walk', repeat: 'once', remote: true, speed: 35, action: 'start' },
  57: { activation: 'walk', repeat: 'once', remote: true, speed: 35, action: 'stop' },
  73: { activation: 'walk', repeat: 'once', remote: true, speed: 35, action: 'start' },
  77: { activation: 'walk', repeat: 'repeat', remote: true, speed: 35, action: 'start' },
  74: { activation: 'walk', repeat: 'repeat', remote: true, speed: 35, action: 'stop' },
  141: { activation: 'switch', repeat: 'once', remote: true, speed: 35, action: 'start' },
};

export function getCrusherSpecial(special: number): CrusherDef | null {
  return CRUSHER_SPECIALS[special] ?? null;
}
