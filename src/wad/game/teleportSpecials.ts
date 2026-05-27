export type TeleportActivation = 'walk';
export type TeleportRepeat = 'once' | 'repeat';

export interface TeleportSpecialDef {
  activation: TeleportActivation;
  repeat: TeleportRepeat;
  /** When false, only players should trigger (Doom 125/126). */
  allowMonsters: boolean;
}

export const TELEPORT_SPECIALS: Record<number, TeleportSpecialDef> = {
  39: { activation: 'walk', repeat: 'once', allowMonsters: true },
  97: { activation: 'walk', repeat: 'repeat', allowMonsters: true },
  125: { activation: 'walk', repeat: 'once', allowMonsters: false },
  126: { activation: 'walk', repeat: 'repeat', allowMonsters: false },
};

export function getTeleportSpecial(special: number): TeleportSpecialDef | null {
  return TELEPORT_SPECIALS[special] ?? null;
}
