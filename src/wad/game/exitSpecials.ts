export type ExitActivation = 'switch' | 'walk';
export type ExitRepeat = 'once' | 'repeat';

export interface ExitDef {
  activation: ExitActivation;
  repeat: ExitRepeat;
}

export const EXIT_SPECIALS: Record<number, ExitDef> = {
  11: { activation: 'switch', repeat: 'once' },
  51: { activation: 'walk', repeat: 'once' },
  52: { activation: 'walk', repeat: 'once' },
  124: { activation: 'walk', repeat: 'once' },
};

export function getExitSpecial(special: number): ExitDef | null {
  return EXIT_SPECIALS[special] ?? null;
}
