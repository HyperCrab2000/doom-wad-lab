export type DonutActivation = 'switch';
export type DonutRepeat = 'once' | 'repeat';

export interface DonutDef {
  activation: DonutActivation;
  repeat: DonutRepeat;
}

export const DONUT_SPECIALS: Record<number, DonutDef> = {
  9: { activation: 'switch', repeat: 'once' },
};

export function getDonutSpecial(special: number): DonutDef | null {
  return DONUT_SPECIALS[special] ?? null;
}
