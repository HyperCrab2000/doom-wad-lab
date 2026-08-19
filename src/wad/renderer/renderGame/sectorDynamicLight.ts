import { Sector } from '@/wad/interfaces/Sector';

/** Doom sector specials that modulate light level over time (p_lights.c). */
const STROBE_FAST = 12;
const STROBE_SLOW = 13;
const BLINK_DAMAGE = 4;
const FLICKER = 17;

export function getEffectiveSectorLightLevel(sector: Sector, timeSeconds: number): number {
  const base = sector.lightlevel;
  const type = sector.type;

  if (type === STROBE_FAST) {
    const phase = Math.floor(timeSeconds * 8) % 2;
    return phase === 0 ? base : Math.max(0, base - 64);
  }

  if (type === STROBE_SLOW) {
    const phase = Math.floor(timeSeconds * 3.5) % 2;
    return phase === 0 ? base : Math.max(0, base - 64);
  }

  if (type === BLINK_DAMAGE) {
    const phase = Math.floor(timeSeconds * 4) % 2;
    return phase === 0 ? base : Math.max(0, base - 48);
  }

  if (type === FLICKER) {
    const noise =
      Math.sin(timeSeconds * 13.7 + sector.floorheight * 0.1) *
      Math.sin(timeSeconds * 7.3);
    return Math.max(0, Math.min(255, base + noise * 24));
  }

  return base;
}

/** GZDoom colormap parity uses simulated sector thinkers (mutated `sector.lightlevel`). */
export function colormapSectorLightLevel(sector: Sector): number {
  return sector.lightlevel;
}
