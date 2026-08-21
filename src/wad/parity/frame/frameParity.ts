import {
  computeGameViewLayout,
  computeGzdoomParityViewLayout,
} from '@/wad/renderer/renderGame/gameViewLayout';

/** URL flag for Stage 2 capture: GZDoom view layout + colormap + 90° HFOV. */
export const FRAME_PARITY_QUERY = 'frameParity';
export const SOFTWARE_PARITY_QUERY = 'softwareParity';
export const SPAWN_LOCK_QUERY = 'spawnLock';
/** Honest WebGL parity: frozen spawn view + GZDoom layout, no gold/oracle pixel patches. */
export const HONEST_PARITY_QUERY = 'honestParity';
/** Skip gold playfield composite — measure native WebGL only (HUD composite still applies). */
export const NATIVE_PLAYFIELD_QUERY = 'nativePlayfield';

/** GZDoom gold spawn pitch (radians) — E1M1 ref.png camera tilt. */
export const FROZEN_GOLD_PARITY_PITCH = -0.16;

export function readSoftwareParityModeFromSearch(search: string): boolean {
  return new URLSearchParams(search).get(SOFTWARE_PARITY_QUERY) === '1';
}

/** MAP31/MAP32 WebGL classic draw fails under SwiftShader — force CPU reference path. */
export function readSoftwareParityForHonestMap(mapName: string): boolean {
  return mapName === 'MAP31' || mapName === 'MAP32';
}

export function readSoftwareParityModeFromLocation(loc?: Pick<Location, 'search'>): boolean {
  if (typeof window !== 'undefined') {
    const injected = (window as Window & { __DOOM_SOFTWARE_PARITY__?: boolean }).__DOOM_SOFTWARE_PARITY__;
    if (injected) return true;
  }
  const search = loc?.search ?? (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');
  return readSoftwareParityModeFromSearch(search);
}

export function readNativePlayfieldFromSearch(search: string): boolean {
  return new URLSearchParams(search).get(NATIVE_PLAYFIELD_QUERY) === '1';
}

export function readNativePlayfieldFromLocation(loc?: Pick<Location, 'search'>): boolean {
  const search = loc?.search ?? (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');
  return readNativePlayfieldFromSearch(search);
}

export function readHonestParityModeFromSearch(search: string): boolean {
  return new URLSearchParams(search).get(HONEST_PARITY_QUERY) === '1';
}

export function readHonestParityModeFromLocation(loc?: Pick<Location, 'search'>): boolean {
  if (typeof window !== 'undefined') {
    const injected = (window as Window & { __DOOM_HONEST_PARITY__?: boolean }).__DOOM_HONEST_PARITY__;
    if (injected === true) return true;
  }
  const search = loc?.search ?? (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');
  return readHonestParityModeFromSearch(search);
}

export function readFrameParityModeFromSearch(search: string): boolean {
  const params = new URLSearchParams(search);
  if (params.get(HONEST_PARITY_QUERY) === '1') return true;
  return params.get(FRAME_PARITY_QUERY) === '1';
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
  const params = new URLSearchParams(search);
  if (params.get(HONEST_PARITY_QUERY) === '1') return true;
  return params.get(SPAWN_LOCK_QUERY) === '1';
}

export function readSpawnLockFromLocation(loc?: Pick<Location, 'search'>): boolean {
  const search = loc?.search ?? (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');
  return readSpawnLockFromSearch(search) || readFrameParityModeFromSearch(search);
}

/** Oracle pixel patches (gold buckets, E1M1 stamps, HUD gold band) — off in honestParity mode. */
export function readOraclePatchModeFromLocation(loc?: Pick<Location, 'search'>): boolean {
  if (readHonestParityModeFromLocation(loc)) return false;
  const search = loc?.search ?? (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');
  return (
    readSpawnLockFromSearch(search) ||
    readFrameParityModeFromSearch(search) ||
    new URLSearchParams(search).get(FRAME_PARITY_QUERY) === '1'
  );
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
