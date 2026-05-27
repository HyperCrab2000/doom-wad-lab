import { Sector } from '@/wad/interfaces/Sector';

/** Doom sector specials that modulate light level over time (p_lights.c). */
const BLINK_RANDOM = 1;
const BLINK_HALF = 2;
const BLINK_ONE = 3;
const BLINK_DAMAGE = 4;
const STROBE_FAST = 12;
const STROBE_SLOW = 13;
const FLICKER = 17;

const DOOM2_BLINK_RANDOM = 65;
const DOOM2_BLINK_HALF = 66;
const DOOM2_BLINK_ONE = 67;
const DOOM2_BLINK_DAMAGE = 68;
const DOOM2_STROBE_FAST = 76;
const DOOM2_STROBE_SLOW = 77;
const DOOM2_FLICKER = 81;
const DOOM2_OSCILLATE = 72;
const COMBO_LAVA = 84;

const LIGHTNING_RISE = 197;
const LIGHTNING_FLASH_64 = 198;
const LIGHTNING_FLASH_32 = 199;

function strobeLevel(base: number, timeSeconds: number, hz: number, drop = 64): number {
  const phase = Math.floor(timeSeconds * hz) % 2;
  return phase === 0 ? base : Math.max(0, base - drop);
}

function oscillateLevel(base: number, timeSeconds: number): number {
  const wave = (Math.sin(timeSeconds * Math.PI * 0.5) + 1) * 0.5;
  return Math.max(0, Math.min(255, base * (0.35 + wave * 0.65)));
}

function randomBlinkLevel(base: number, timeSeconds: number, sector: Sector): number {
  const seed = sector.floorheight * 0.17 + sector.ceilingheight * 0.11;
  const phase = Math.floor((timeSeconds + seed) * 7.1) % 3;
  if (phase === 0) return Math.max(0, base - 48);
  if (phase === 1) return base;
  return Math.max(0, base - 24);
}

export function getEffectiveSectorLightLevel(sector: Sector, timeSeconds: number): number {
  const base = sector.lightlevel;
  const type = sector.type;

  if (type === STROBE_FAST || type === DOOM2_STROBE_FAST) {
    return strobeLevel(base, timeSeconds, 8);
  }

  if (type === STROBE_SLOW || type === DOOM2_STROBE_SLOW) {
    return strobeLevel(base, timeSeconds, 3.5);
  }

  if (type === BLINK_HALF || type === DOOM2_BLINK_HALF) {
    return strobeLevel(base, timeSeconds, 4);
  }

  if (type === BLINK_ONE || type === DOOM2_BLINK_ONE) {
    return strobeLevel(base, timeSeconds, 2);
  }

  if (type === BLINK_DAMAGE || type === DOOM2_BLINK_DAMAGE || type === COMBO_LAVA) {
    return strobeLevel(base, timeSeconds, 4, 48);
  }

  if (type === BLINK_RANDOM || type === DOOM2_BLINK_RANDOM) {
    return randomBlinkLevel(base, timeSeconds, sector);
  }

  if (type === FLICKER || type === DOOM2_FLICKER) {
    const noise =
      Math.sin(timeSeconds * 13.7 + sector.floorheight * 0.1) *
      Math.sin(timeSeconds * 7.3);
    return Math.max(0, Math.min(255, base + noise * 24));
  }

  if (type === 8 || type === DOOM2_OSCILLATE) {
    return oscillateLevel(base, timeSeconds);
  }

  if (type === LIGHTNING_RISE) {
    const rise = Math.min(64, timeSeconds * 4);
    return Math.min(255, base + rise);
  }

  if (type === LIGHTNING_FLASH_64) {
    const flash = Math.sin(timeSeconds * 2.4) > 0.6 ? 64 : 0;
    return Math.min(255, base + flash);
  }

  if (type === LIGHTNING_FLASH_32) {
    const flash = Math.sin(timeSeconds * 2.4) > 0.6 ? 32 : 0;
    return Math.min(255, base + flash);
  }

  return base;
}
