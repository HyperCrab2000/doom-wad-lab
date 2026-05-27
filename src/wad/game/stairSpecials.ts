export type StairActivation = 'switch' | 'walk';
export type StairRepeat = 'once' | 'repeat';

export interface StairDef {
  activation: StairActivation;
  repeat: StairRepeat;
  stepHeight: number;
  speed: number;
  turbo: boolean;
  /** Turbo stairs crush sectors while building (100, 127). */
  crush: boolean;
}

export const STAIR_SPECIALS: Record<number, StairDef> = {
  7: { activation: 'switch', repeat: 'once', stepHeight: 8, speed: 35, turbo: false, crush: false },
  8: { activation: 'walk', repeat: 'once', stepHeight: 8, speed: 35, turbo: false, crush: false },
  100: { activation: 'walk', repeat: 'once', stepHeight: 16, speed: 280, turbo: true, crush: true },
  127: { activation: 'switch', repeat: 'once', stepHeight: 16, speed: 280, turbo: true, crush: true },
};

export function getStairSpecial(special: number): StairDef | null {
  return STAIR_SPECIALS[special] ?? null;
}
