export type DoomKeyColor = 'blue' | 'red' | 'yellow';

export interface PlayerKeyState {
  blue: boolean;
  red: boolean;
  yellow: boolean;
}

/** Line specials that require a key (vanilla keyed doors). */
export const KEYED_DOOR_SPECIALS: Record<number, DoomKeyColor> = {
  26: 'blue',
  27: 'yellow',
  28: 'red',
  32: 'blue',
  33: 'red',
  34: 'yellow',
  99: 'blue',
  133: 'blue',
  134: 'red',
  135: 'red',
  136: 'yellow',
  137: 'yellow',
};

export function getKeyedDoorColor(special: number): DoomKeyColor | null {
  return KEYED_DOOR_SPECIALS[special] ?? null;
}

/** When `keys` is omitted (e.g. unit tests), keyed doors still open. */
export function playerHasDoorKey(
  keys: PlayerKeyState | null | undefined,
  color: DoomKeyColor | null | undefined
): boolean {
  if (!color) return true;
  if (!keys) return true;
  switch (color) {
    case 'blue':
      return keys.blue;
    case 'red':
      return keys.red;
    case 'yellow':
      return keys.yellow;
    default:
      return false;
  }
}
