/** Vanilla STF status face lump names (status bar, 23×23). */
export type StatusFaceLump =
  | 'STFGOD0'
  | 'STFSTF0'
  | 'STFSTF1'
  | 'STFSTF2'
  | 'STFSTF3'
  | 'STFSTF4'
  | 'STFDEAD0'
  | 'STFKILL0';

export function getStatusFaceLump(
  health: number,
  alive: boolean,
  options: {
    invulnerable?: boolean;
    berserk?: boolean;
    painUntil?: number;
    now?: number;
  } = {}
): StatusFaceLump {
  const now = options.now ?? performance.now();

  if (!alive || health <= 0) {
    return 'STFDEAD0';
  }

  if (options.invulnerable) {
    return 'STFGOD0';
  }

  if (options.painUntil && now < options.painUntil) {
    return 'STFKILL0';
  }

  if (options.berserk && health > 25) {
    return 'STFSTF1';
  }

  if (health >= 90) return 'STFSTF0';
  if (health >= 60) return 'STFSTF2';
  if (health >= 40) return 'STFSTF2';
  if (health >= 25) return 'STFSTF3';
  return 'STFSTF4';
}

/** How long the ouch face shows after damage. */
export const PAIN_FACE_MS = 700;
