import {
  readFrameParityModeFromLocation,
  readSpawnLockFromLocation,
} from '@/wad/parity/frame/frameParity';

/** Play backends draw with TS/WebGL2. Oracle backends run GZDoom GLES in WASM (gold diff only). */
export type RenderBackend = 'classic' | 'pathtrace' | 'wasm-federated' | 'gzdoom-wasm' | 'gzdoom-s-wasm';

const BACKEND_VALUES: RenderBackend[] = ['classic', 'pathtrace', 'wasm-federated', 'gzdoom-wasm', 'gzdoom-s-wasm'];

function parseBackend(value: string | null): RenderBackend | null {
  if (value && BACKEND_VALUES.includes(value as RenderBackend)) {
    return value as RenderBackend;
  }
  return null;
}

export function isFullResPathTraceEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const pt = new URLSearchParams(window.location.search).get('pt');
  return pt === 'full' || pt === 'bruteforce';
}

export function isAdaptivePathTraceEnabled(): boolean {
  return !isFullResPathTraceEnabled();
}

export function readDefaultRenderBackend(): RenderBackend {
  if (typeof window === 'undefined') return 'gzdoom-wasm';
  const fromUrl = parseBackend(new URLSearchParams(window.location.search).get('renderer'));
  if (fromUrl) return fromUrl;
  const fromSession = parseBackend(sessionStorage.getItem('doom-render-backend'));
  if (fromSession) return fromSession;
  return 'classic';
}

export function isGzdoomWasmFamily(backend: RenderBackend): boolean {
  return backend === 'gzdoom-wasm' || backend === 'gzdoom-s-wasm';
}

export function isGzdoomGoldBackend(backend: RenderBackend): boolean {
  return backend === 'gzdoom-wasm';
}

/** Shipped play — pure Node parse + TypeScript WebGL2 (no Emscripten GLES). */
export function isPlayRenderBackend(backend: RenderBackend): boolean {
  return backend === 'classic' || backend === 'wasm-federated' || backend === 'pathtrace';
}

/** Frozen parity oracle — Emscripten or full GZDoom GLES draw; not play. */
export function isOracleRenderBackend(backend: RenderBackend): boolean {
  return isGzdoomWasmFamily(backend);
}

/** Modular stripped fork — pure WASM, Node lumps + GZSTATE (not the Emscripten gold binary). */
export function isGzdoomModularBackend(backend: RenderBackend): boolean {
  return backend === 'gzdoom-s-wasm';
}

/** Live render-layer rail (Classic WebGL + GZDoom modular only — not GZDoom gold). */
export function showRenderLayerRail(backend: RenderBackend): boolean {
  return backend === 'gzdoom-s-wasm' || backend === 'classic';
}

/** Classic WebGL: PLAYPAL index textures + COLORMAP bands (GZDoom HW lighting model). */
export function classicUsesGzdoomColormap(backend: RenderBackend): boolean {
  if (backend !== 'classic') return false;
  if (typeof window === 'undefined') return false;
  if (readFrameParityModeFromLocation() || readSpawnLockFromLocation()) return true;
  // Colormap is core Classic play — not gated on parity extras (classicExtras only restores embellishments).
  return true;
}

export function needsClassicWebGLGame(backend: RenderBackend): boolean {
  return !isGzdoomWasmFamily(backend);
}

/** True when the UI must parse/index WAD lumps via doom-wad-core (Classic, federated, (s)). */
export function needsNodeWadLumpParse(backend: RenderBackend): boolean {
  return (
    backend === 'classic' ||
    backend === 'pathtrace' ||
    backend === 'wasm-federated' ||
    backend === 'gzdoom-s-wasm'
  );
}

export function persistRenderBackend(backend: RenderBackend): void {
  sessionStorage.setItem('doom-render-backend', backend);
}

/** Classic WebGL map load backend (GZDoom WASM backends use separate capture/play paths). */
export function backendForMapLoad(uiBackend: RenderBackend): Exclude<RenderBackend, 'gzdoom-wasm' | 'gzdoom-s-wasm'> {
  return isGzdoomWasmFamily(uiBackend) ? 'classic' : uiBackend;
}
