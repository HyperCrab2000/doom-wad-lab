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
  return 'gzdoom-wasm';
}

export function isGzdoomWasmFamily(backend: RenderBackend): boolean {
  return backend === 'gzdoom-wasm' || backend === 'gzdoom-s-wasm';
}

export function isGzdoomGoldBackend(backend: RenderBackend): boolean {
  return backend === 'gzdoom-wasm';
}

/** Modular stripped fork — pure WASM, Node lumps + GZSTATE (not the Emscripten gold binary). */
export function isGzdoomModularBackend(backend: RenderBackend): boolean {
  return backend === 'gzdoom-s-wasm';
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
