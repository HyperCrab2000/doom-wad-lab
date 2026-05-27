export type LightActivation = 'switch' | 'walk';
export type LightRepeat = 'once' | 'repeat';
export type LightEffect = 'zero' | 'max255' | 'maxNeighbor' | 'lowestNeighbor' | 'flicker';

export interface LightDef {
  activation: LightActivation;
  repeat: LightRepeat;
  remote: boolean;
  effect: LightEffect;
}

export const LIGHT_SPECIALS: Record<number, LightDef> = {
  35: { activation: 'walk', repeat: 'once', remote: true, effect: 'zero' },
  79: { activation: 'walk', repeat: 'once', remote: true, effect: 'zero' },
  139: { activation: 'switch', repeat: 'repeat', remote: true, effect: 'zero' },

  12: { activation: 'walk', repeat: 'once', remote: true, effect: 'maxNeighbor' },
  80: { activation: 'walk', repeat: 'once', remote: true, effect: 'maxNeighbor' },

  13: { activation: 'walk', repeat: 'once', remote: true, effect: 'max255' },
  81: { activation: 'walk', repeat: 'once', remote: true, effect: 'max255' },
  138: { activation: 'switch', repeat: 'repeat', remote: true, effect: 'max255' },

  104: { activation: 'walk', repeat: 'once', remote: true, effect: 'lowestNeighbor' },

  17: { activation: 'walk', repeat: 'once', remote: true, effect: 'flicker' },
};

export function getLightSpecial(special: number): LightDef | null {
  return LIGHT_SPECIALS[special] ?? null;
}
