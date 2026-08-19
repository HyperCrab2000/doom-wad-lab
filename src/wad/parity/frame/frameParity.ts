import {
  computeGameViewLayout,
  computeGzdoomParityViewLayout,
} from '@/wad/renderer/renderGame/gameViewLayout';

/** URL flag for Stage 2 capture: GZDoom view layout + colormap + 90° HFOV. */
export const FRAME_PARITY_QUERY = 'frameParity';
export const SOFTWARE_PARITY_QUERY = 'softwareParity';
export const SPAWN_LOCK_QUERY = 'spawnLock';

/** GZDoom gold spawn pitch (radians) — E1M1 ref.png camera tilt. */
export const FROZEN_GOLD_PARITY_PITCH = -0.16;

export function readSoftwareParityModeFromSearch(search: string): boolean {
  return new URLSearchParams(search).get(SOFTWARE_PARITY_QUERY) === '1';
}

export function readSoftwareParityModeFromLocation(loc?: Pick<Location, 'search'>): boolean {
  if (typeof window !== 'undefined') {
    const injected = (window as Window & { __DOOM_SOFTWARE_PARITY__?: boolean }).__DOOM_SOFTWARE_PARITY__;
    if (injected) return true;
  }
  const search = loc?.search ?? (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');
  return readSoftwareParityModeFromSearch(search);
}

export function readFrameParityModeFromSearch(search: string): boolean {
  return new URLSearchParams(search).get(FRAME_PARITY_QUERY) === '1';
}

function readFrameParityInjectedFlag(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as Window & { __DOOM_FRAME_PARITY__?: boolean }).__DOOM_FRAME_PARITY__);
}

export function readFrameParityModeFromLocation(loc?: Pick<Location, 'search'>): boolean {
  if (readFrameParityInjectedFlag()) return true;
  const search = loc?.search ?? (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');
  return readFrameParityModeFromSearch(search);
}

export function readSpawnLockFromSearch(search: string): boolean {
  return new URLSearchParams(search).get(SPAWN_LOCK_QUERY) === '1';
}

export function readSpawnLockFromLocation(loc?: Pick<Location, 'search'>): boolean {
  const search = loc?.search ?? (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');
  return readSpawnLockFromSearch(search) || readFrameParityModeFromSearch(search);
}

/** GZDoom `fov` CVAR: horizontal degrees across view width (default 90). */
export function doomVerticalFovDegrees(
  viewWidth: number,
  viewHeight: number,
  horizontalFovDeg = 90,
): number {
  const aspect = viewWidth / Math.max(1, viewHeight);
  const hRad = (horizontalFovDeg / 180) * Math.PI;
  const vRad = 2 * Math.atan(Math.tan(hRad / 2) / aspect);
  return (vRad * 180) / Math.PI;
}

export function resolvePlayfieldLayout(
  canvasWidth: number,
  canvasHeight: number,
  frameParity: boolean,
) {
  return frameParity
    ? computeGzdoomParityViewLayout(canvasWidth, canvasHeight)
    : computeGameViewLayout(canvasWidth, canvasHeight);
}
